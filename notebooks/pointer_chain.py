from typing import Generator, TypedDict, cast
from itertools import product

def to_parts(path:str):
    return path.split("/")

class Node(TypedDict):
    feeders: list[str]
    consumers: list[str]
    value: str
    id: str
    type: str

class Edge(TypedDict):
    keyword: str

class ChangeMessage(TypedDict):
    old:str
    new:str
    source: str
    dest: str

class Graph:
    nodes: dict[str, Node]
    edges: dict[tuple[str, str], Edge]

    def __init__(self):
        self.nodes={}
        self.edges={}

    @property
    def _cyclic(self):
        visited:set[str] = set()
        rec_stack:set[str] = set()

        def dfs(u: str) -> bool:
            visited.add(u)
            rec_stack.add(u)
            for v in self.nodes[u]["consumers"]:
                if v not in visited:
                    if dfs(v):
                        return True
                elif v in rec_stack:
                    return True
            rec_stack.remove(u)
            return False

        for node in self.nodes:
            if node not in visited:
                if dfs(node):
                    return True
        return False
    
    @property
    def _acyclic(self):
        return not self._cyclic

    def _fetch_context(self, path:str) -> dict[str, str]:
        return dict(
            (
                self.edges[(u,path)]["keyword"], 
                self.nodes[u]["value"]
            ) for u in self._feeders(path)
        )
    
    def _consumers(self, path:str):
        return self.nodes[path]["consumers"]
    
    def _feeders(self, path:str):
        return self.nodes[path]["feeders"]
    
    def register_change(self, path:str, value:str):
        node = self.nodes[path]
        if node["value"] == value:
            return
        
        node["value"] = value
        chain = self.calc_chain(path)
        # Some functions, while in the chain, might not have any modified inputs, and
        # therefore, can be skipped. When an node is modified, all consumers are marked as
        # dirty, and any dirty function will be re-evaluated.
        dirty = set(self._consumers(path))

        # The graph is constructed such that all edges connect a data and func node together.
        # Since only data nodes are modified directly, we know that every 2nd node
        # in the chain is a func node.
        functions = [x for x, i in chain.items() if i%2]
        functions.sort(key=lambda x:chain[x]) # sort by execution order
        
        for funcPath in functions:
            if funcPath not in dirty:
                continue
            change = self.evaluate(funcPath)
            if change["old"] != change["new"]:
                dirty.update(change["dest"])

    def _getTarget(self, funcPath:str):
        return self._consumers(funcPath)[0]
        
    def evaluate(self, funcPath:str) -> ChangeMessage:
        # TODO
        # [ ] Check if context itself is dirty, if so, re-evaluate the edges
        func = self.nodes[funcPath]
        template = func["value"]
        targetPath = self._consumers(funcPath)[0] # functions only have one target
        target = self.nodes[targetPath]
        old = target["value"]
        kwargs = self._fetch_context(funcPath)
        target["value"] = template.format(**kwargs)
        return {
            "old": old,
            "new": target["value"],
            "source": funcPath,
            "dest": targetPath
        }
        
    def calc_chain(self, path:str, order:int=0, collector:dict[str, int]|None=None):
        """
        DFS walk down all paths from a parent node keeping track of the longest
        path length from the source.
        """
        collector = collector or {}
        for v in self._consumers(path):
            collector[v] = max(collector.get(v, 0), order + 1)
            self.calc_chain(v, order+1, collector)
        return collector
    
    def insert_node(self, path:str, value:str):
        assert path not in self.nodes
        self.nodes[path] = Node(
            feeders=[],
            consumers=[],
            id=path,
            value=value,
            type="data"
        )
    
    def insert_func(self, path:str, func:str, context:dict[str, str], target:str):
        assert len(self._feeders(target)) == 0
        feeders = list(context.values())
        self.nodes[path] = Node(
            feeders=feeders,
            consumers=[target],
            id=path,
            value=func,
            type="func"
        )
        for u in feeders:
            self.nodes[u]["consumers"].append(path)
        self.nodes[target]["feeders"].append(path)
        self.edges.update({(u,path):{"keyword":k} for k,u in context.items()})
        self.edges.update({(path, target):{"keyword":""}})
        assert self._acyclic

    def register_function(
        self,
        name:str,
        template:str,
        forEach:str|list[tuple[str|list[str],str]]|list[tuple[list[str],str]],
        context:dict[str, str],
        target:str
    ):
        if isinstance(forEach, str):
            forEach = [(["key"], forEach)]
        for i, [key, prefix] in enumerate([*forEach]):
            if isinstance(key, str):
                forEach[i] = ([key], prefix)
        forEach=cast(list[tuple[list[str],str]], forEach)
        
        # TODO
        # [x] Handle Links for each pre-existing key
        # [ ] Handle Links for new keys (oncreate / ondelete)
        # [x] Product
        # [x] Nested range
        # [~] Nested domain (No need... jsonpointers will resolve this for us... but it will require 2 functions with an intermediate target)
        #     support some syntax for specifying an input parameter
        #     which is a dictionary mapping. i.e. it watches many other nodes.
        # Establish universal link for watching inputs and regenerating links
        #   Some link paths may change depending on the value at other links
        # Insert function into graph
        self.insert_node(f"/templates/{name}", template)
        # TODO: use peek
        key_names: list[list[str]] = []
        keys: list[list[list[str]]] = []
        for keyname, prefix in forEach:
            key_names.append(keyname)
            keys.append([list(x) for x in set(self._discover(prefix))])
        
        for key in product(*keys):
            keylist:list[str] = sum(key, cast(list[str],[]))
            namelist = sum(key_names, cast(list[str],[]))
            
            suffix = "/".join(keylist)
            calc_path = f"functions/{name}/{suffix}"
            ctx, deps = self._resolve_dependencies(context, dict(zip(namelist, keylist)))
            resolved_target = target.format(**ctx)
            self.insert_func(calc_path, template, deps, resolved_target)

    def _discover(self, prefix:str) -> Generator[tuple[str, ...]]:
        """
        Part of the function registry process...
        This function resolves the range of the function
        by finding every match to the forEach property.

        what if there are 2 items under a single key to track
        e.g. I want a new function for every name and title...
        ans. Too bad, make 2 different funcplates
        """
        prefix_parts = prefix.split("/*/")
        if prefix_parts[-1].endswith("/*"):
            prefix_parts[-1] = prefix_parts[-1].rstrip("/*")
            prefix_parts.append('*')
        
        for nodePath in self.nodes:
            key: list[str] = []
            match = True
            for p in prefix_parts:
                p = p + "/"
                if p == "*/":
                    parts = to_parts(nodePath)
                elif nodePath.startswith(p):
                    parts = to_parts(nodePath[len(p):])
                else:
                    match = False
                    break
                key.append(parts[0])
                nodePath = "/".join(parts[1:])
            if match:
                yield tuple(key)

    def _resolve_dependencies(self, context:dict[str, str], key:dict[str, str])-> tuple[dict[str, str], dict[str,str]]:
        ctx = {**key}
        ret:dict[str, str] = {}
        for k,v in context.items():
            pointer = v.format(**ctx)
            ctx[k] = self.nodes[pointer]["value"]
            ret[k] = pointer
        return ctx, ret

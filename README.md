# Twig
This is an experimental database server.

## Design Principles
1. Queries should look vaguely like [JSONPath](https://www.npmjs.com/package/jsonpath)
2. Leaf nodes should be automatically extracted and maintained as independent records in the database, mainly for tracking changes.
   1. Tracking atomic changes within arbitrarily nested datastructures is the primary reason for doing this.
3. Structure is non-strict (one big document)
4. Users must obtain permission to view / edit data within a `space`

## Commands
| command | description |
| ------- | ----------- |
| `pixi run start` | 1. Creates a postgresql server<br>2. Creates a database called `twig`<br>3. Starts the FastAPI server |
| `pixi run test` | Runs the unit tests |
| `pixi run fix` | Makes code look pretty |
| `pixi run stop` | Shut down the postgresql server<br>_There may be some ghost processes requiring a reboot to kill.<br> I saw this once on windows when I tried to rename the repo._


## Usage
### Put
Set a single data point
```
PUT <host>:<port>/?path=path%2Fto%2Fmy%2Fdatum&space=1&value=500"
# path = path/to/my/datum 
#     this is the JSONPath indicating where the item should be placed
# space = 1
#     this is the id of the dataspace which the user must have edit priveleges in
# value = 500 
#     this is the thing to put at the path
```
This is equivalent
```
PUT <host>:<port>/?path=path%2Fto&space=1&value=%7B%27my%27%3A+%7B%27datum%27%3A+500%7D%7D
# path = path/to
# space = 1
# value = {"my": {"datum":500}}
```

**Multiple Values**
```
PUT <host>:<port>/?path=path%2Fto&space=1&value=%7B%27my%27%3A+%7B%27datum%27%3A+500%7D%7D
# path = path/to
# space = 1
# value = {"my": {"datum":500, "otherDatum": {"value": "hello"}}}
```
This is equivalent
```
PUT <host>:<port>/?path=path%2Fto%2Fmy%2Fdatum&space=1&value=500
PUT <host>:<port>/?path=path%2Fto%2Fmy%2Fdatum%2FotherDatum%2Fvalue&space=1&value=%22hello%22
```
# Twig
Twig is an experimental document database designed around JSON Pointer paths.

Unlike traditional document stores, Twig decomposes documents into primitive values and stores each value independently. Documents are reconstructed on demand when queried.

The primary goal is to offer granular change tracking to deeply nested data.


## Why?

Many applications work with large nested structures but only modify small portions of them.

For example:

{
  "user": {
    "profile": {
      "name": "Joel"
    }
  }
}

Updating /user/profile/name should not require rewriting the entire document.

Twig stores primitive values separately and uses JSON Pointer paths as stable identifiers, allowing updates and subscriptions to target specific locations within a document.



## Core Concepts
### Spaces

Data is partitioned into spaces.

A user must have permission to access a space before they can:

- read data
- modify data
- subscribe to changes

Spaces provide the primary isolation boundary within the database.

### Paths

Twig uses JSON Pointer style paths:

```
/user/profile/name
/settings/theme
/projects/123/tasks/0/title
```

Paths identify locations within a document hierarchy.

### Storage Model

Documents are decomposed into primitive values.

Example:

{
  "user": {
    "name": "Joel",
    "age": 35
  }
}

Is stored internally as:

```
/user/name -> "Joel"
/user/age  -> 35
```

Queries reconstruct documents from matching paths.

This storage model enables:

- atomic updates
- efficient change tracking
- path-based subscriptions
- document reconstruction on demand

### Realtime Subscriptions

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/CYSsFLE-bE0/0.jpg)](https://www.youtube.com/watch?v=CYSsFLE-bE0)




Twig supports websocket subscriptions.

Clients may subscribe to a path:

`WATCH /user`

Any update beneath that path will be delivered to the subscriber:

`PUT /user/profile/name`

Results in a notification such as:

```json
{
  "action": "update",
  "path": "/user/profile/name",
  "value": "Joel"
}
```

Subscription routing uses the same path hierarchy as storage and querying.


## Design Principles
1. Paths should be simple and familiar.
2. Leaf values should be independently addressable.
3. Atomic updates should be first-class operations.
4. Realtime subscriptions should follow the same path semantics as queries.
5. Structure is flexible and schema-free.
6. Permissions are enforced at the space level.

## Commands
| command | description |
| ------- | ----------- |
| `pixi run start` | 1. Creates a postgresql server<br>2. Creates a database called `twig`<br>3. Starts the FastAPI server |
| `pixi run test` | Runs the unit tests |
| `pixi run fix` | Makes code look pretty |
| `pixi run stop` | Shut down the postgresql server |


## Usage
see [client.py](src/twig/client.py) and [test_api.py](tests/test_api.py)

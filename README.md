# Twig
This is an experimental database server.

## Design Principles
1. Queries should look vaguely like [JSONPath](https://www.npmjs.com/package/jsonpath)
2. Leaf nodes should be automatically extracted and maintained as independent records in the database, mainly for tracking changes.
   1. Tracking atomic changes within arbitrarily nested datastructures is the primary reason for doing this.
3. Structure is non-strict (one big document)
4. Users must obtain permission to view / edit data within a `space`

_This is not strictly a requirement, but the api does allow insersion into a dictionary that does not yet exist (aka `create_keys`). This may change in the future as the cost is likely more than it is worth. Without this requirement, we could probably just use a single JSONB column to hold data, as opposed to a new row for each primitive. However, tracking changes may be more complicated using that approach. This option is being explored in the `identity-crisis` branch_

## Commands
| command | description |
| ------- | ----------- |
| `pixi run start` | 1. Creates a postgresql server<br>2. Creates a database called `twig`<br>3. Starts the FastAPI server |
| `pixi run test` | Runs the unit tests |
| `pixi run fix` | Makes code look pretty |
| `pixi run stop` | Shut down the postgresql server |


## Usage
see [client.py](src/twig/client.py) and [test_api.py](tests/test_api.py)

> [!WARNING]
> Lists are supported, but are not efficient, so avoid them if possible.



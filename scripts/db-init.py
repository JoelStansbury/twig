"""
Create a postgres db
"""

from argparse import ArgumentParser
import os
from pathlib import Path
from subprocess import check_call, check_output, call, run
import platform


def running(process:str) -> list[str]:
    if platform.system() == "Windows":
        import psutil
        return bool([
            p.info['pid'] for p in psutil.process_iter(attrs=['pid', 'name']) 
            if process in p.info['name']
        ])
    
    return int(run(["pgrep", "postgres", "-c"], text=True, capture_output=True).stdout)>0

def db_exists(dbname:str):
    query = f"SELECT datname FROM pg_database WHERE datname = '{dbname}';"
    return "(1 row)" in check_output([
        "psql",
        "-d", "postgres",
        "-c", query
    ], text=True)

def drop(dbname:str):
    call([
        "psql",
        "-d", "postgres",
        "-c", f"DROP DATABASE {dbname};"
    ])

def create(dbname:str):
    call([
        "psql",
        "-d", "postgres",
        "-c", f"CREATE DATABASE {dbname};"
    ])

def init_cluster(directory:Path):
    """
    Usage:
    initdb [OPTION]... [DATADIR]

    Options:
    -A, --auth=METHOD         default authentication method for local connections
        --auth-host=METHOD    default authentication method for local TCP/IP connections
        --auth-local=METHOD   default authentication method for local-socket connections
    [-D, --pgdata=]DATADIR     location for this database cluster
    -E, --encoding=ENCODING   set default encoding for new databases
    -g, --allow-group-access  allow group read/execute on data directory
        --icu-locale=LOCALE   set ICU locale ID for new databases
        --icu-rules=RULES     set additional ICU collation rules for new databases
    -k, --data-checksums      use data page checksums
        --locale=LOCALE       set default locale for new databases
        --lc-collate=, --lc-ctype=, --lc-messages=LOCALE
        --lc-monetary=, --lc-numeric=, --lc-time=LOCALE
                                set default locale in the respective category for
                                new databases (default taken from environment)
        --no-locale           equivalent to --locale=C
        --builtin-locale=LOCALE
                                set builtin locale name for new databases
        --locale-provider={builtin|libc|icu}
                                set default locale provider for new databases
        --no-data-checksums   do not use data page checksums
        --pwfile=FILE         read password for the new superuser from file
    -T, --text-search-config=CFG
                                default text search configuration
    -U, --username=NAME       database superuser name
    -W, --pwprompt            prompt for a password for the new superuser
    -X, --waldir=WALDIR       location for the write-ahead log directory
        --wal-segsize=SIZE    size of WAL segments, in megabytes

    Less commonly used options:
    -c, --set NAME=VALUE      override default setting for server parameter
    -d, --debug               generate lots of debugging output
        --discard-caches      set debug_discard_caches=1
    -L DIRECTORY              where to find the input files
    -n, --no-clean            do not clean up after errors
    -N, --no-sync             do not wait for changes to be written safely to disk
        --no-sync-data-files  do not sync files within database directories
        --no-instructions     do not print instructions for next steps
    -s, --show                show internal settings, then exit
        --sync-method=METHOD  set method for syncing files to disk
    -S, --sync-only           only sync database files to disk, then exit

    """

    if not directory.exists():
        check_call([
            "initdb",
            "--pgdata", directory,
        ])
    else:
        print(f"Skipping initdb: {directory} already exists")

def start_server(directory:Path, log:Path):
    pids = running("postgres")
    if not pids:
        check_call([
            "pg_ctl",
            "start",
            "--pgdata", directory,
            "--log", log,
        ])
    else:
        print(f"Skipping postgres startup: already running.")

def init_db(name:str, delete:bool):
    if not db_exists(name):
        create(name)
    else:
        if delete:
            drop(name)
            create(name)
        print("Skipping db creation: already exists")

def main(directory:Path, name:str, log:Path, delete:bool):
    init_cluster(directory)
    start_server(directory, log)
    init_db(name, delete)

if __name__ == "__main__":
    parser = ArgumentParser()

    parser.add_argument(
        "-d",
        "--directory",
        type=Path,
        help="Directory of the db cluster (%(default)s)",
        default=(Path(os.curdir).resolve() / "cluster")
    )

    parser.add_argument(
        "-n",
        "--name",
        type=Path,
        help="Name of the database (%(default)s)",
        default="db"
    )

    parser.add_argument(
        "-l",
        "--log",
        type=Path,
        help="Path to log output (%(default)s)",
        default=(Path(os.curdir).resolve() / "db.log")
    )

    parser.add_argument(
        "--delete",
        action='store_true',
        help="Delete the database and remake if it exists (%(default)s)",
        default=False
    )


    args = parser.parse_args()
    main(
        directory=args.directory,
        name=args.name,
        log=args.log,
        delete=args.delete,
    )

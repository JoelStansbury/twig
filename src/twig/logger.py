import logging


class LOG:
    PUT = logging.getLogger("PUT")
    GET = logging.getLogger("GET")
    DELETE = logging.getLogger("DELETE")
    WATCH = logging.getLogger("WS")

LOG.PUT.setLevel(logging.ERROR)
LOG.GET.setLevel(logging.ERROR)
LOG.DELETE.setLevel(logging.ERROR)
LOG.WATCH.setLevel(logging.ERROR)
logging.getLogger("watchfiles.main").setLevel(logging.ERROR)
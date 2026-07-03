import logging


class LOG:
    PUT = logging.getLogger("PUT")
    GET = logging.getLogger("GET")
    DELETE = logging.getLogger("DELETE")
    WATCH = logging.getLogger("WS")

LOG.PUT.setLevel(logging.DEBUG)
LOG.GET.setLevel(logging.DEBUG)
LOG.DELETE.setLevel(logging.DEBUG)
LOG.WATCH.setLevel(logging.DEBUG)
logging.getLogger("watchfiles.main").setLevel(logging.ERROR)
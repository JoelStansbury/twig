from .constants import PORT
import uvicorn


if __name__ == "__main__":
    uvicorn.run("twig:app", host="127.0.0.1", port=PORT, reload=True)

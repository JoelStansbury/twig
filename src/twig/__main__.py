from .constants import PORT
import uvicorn

if __name__ == "__main__":
    uvicorn.run("twig:app", host="0.0.0.0", port=PORT, reload=True)

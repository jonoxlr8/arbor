from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {
        "app": "Arbor",
        "version": "0.1.0",
        "status": "online"
    }
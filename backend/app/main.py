from fastapi import FastAPI
from app.routes.profiles import router as profiles_router

app = FastAPI()

app.include_router(profiles_router)


@app.get("/")
def root():
    return {
        "app": "Arbor",
        "version": "0.1.0",
        "status": "online"
    }

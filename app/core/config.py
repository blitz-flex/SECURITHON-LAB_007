class Settings:
    PROJECT_NAME: str = "Securithon Lab"
    VERSION: str = "2.0.2"
    SECRET_KEY: str = "securithon-lab-top-secret-key-change-this"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

settings = Settings()

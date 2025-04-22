from setuptools import setup, find_packages

setup(
    name="sushi_pos_api",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        "pydantic",
        "pydantic-settings",
        "psycopg2-binary",  # PostgreSQL adapter
    ],
) 
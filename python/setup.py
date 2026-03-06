"""
Setup script for convex_client package.
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="convex-client",
    version="0.1.0",
    author="Holocron Project",
    description="Python client library for Convex backends",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(exclude=["tests", "tests.*"]),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.9",
    install_requires=[
        "requests>=2.31.0,<3.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=8.0.0,<9.0.0",
            "pytest-cov>=4.1.0,<5.0.0",
            "black>=24.0.0,<25.0.0",
            "mypy>=1.8.0,<2.0.0",
            "ruff>=0.2.0,<1.0.0",
        ],
    },
)

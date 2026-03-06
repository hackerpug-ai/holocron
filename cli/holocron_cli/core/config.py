"""
Configuration management for the holocron CLI.

Handles environment variables and CLI configuration options.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    """CLI configuration settings."""

    convex_url: str
    log_level: str = "INFO"
    output_format: str = "text"  # text, json, or yaml

    @classmethod
    def from_env(cls) -> "Config":
        """
        Load configuration from environment variables.

        Returns:
            Config instance

        Raises:
            ValueError: If required environment variables are missing
        """
        convex_url = os.environ.get("CONVEX_URL")
        if not convex_url:
            raise ValueError("CONVEX_URL environment variable is required")

        return cls(
            convex_url=convex_url,
            log_level=os.environ.get("LOG_LEVEL", "INFO"),
            output_format=os.environ.get("OUTPUT_FORMAT", "text"),
        )

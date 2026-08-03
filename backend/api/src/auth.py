"""Supabase JWT authentication middleware.

Validates JWT tokens from Supabase Auth and injects user context
into the request state. Public endpoints (health, docs) bypass auth.
"""
from typing import Optional

from jose import jwt, JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.config import settings


# Endpoints that don't require auth
PUBLIC_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


class AuthMiddleware(BaseHTTPMiddleware):
    """Validates Supabase JWT tokens on protected routes."""

    async def dispatch(self, request: Request, call_next):
        # Skip auth for public endpoints
        path = request.url.path
        if path in PUBLIC_PATHS or path.startswith("/docs"):
            return await call_next(request)

        # In dev mode with default JWT secret, allow all (for local development)
        if not settings.JWT_SECRET or settings.JWT_SECRET == "fp_dev_jwt":
            request.state.user = None
            request.state.user_id = None
            return await call_next(request)

        token = self._extract_token(request)
        if not token:
            return Response(
                status_code=401,
                content='{"detail": "Missing or invalid Authorization header"}',
                media_type="application/json",
            )

        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
            request.state.user = payload
            request.state.user_id = payload.get("sub")
        except JWTError as e:
            error_msg = "Token expired" if "expired" in str(e).lower() else "Invalid token"
            return Response(
                status_code=401,
                content=f'{{"detail": "{error_msg}"}}',
                media_type="application/json",
            )

        return await call_next(request)

    def _extract_token(self, request: Request) -> Optional[str]:
        """Extract JWT from Authorization header."""
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        return None

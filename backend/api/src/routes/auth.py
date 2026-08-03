"""Auth routes — current user info."""
from fastapi import APIRouter, Request, HTTPException

router = APIRouter()


@router.get("/me")
async def get_current_user(request: Request):
    """Return the authenticated user's profile from the JWT."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "id": user.get("sub"),
        "email": user.get("email"),
        "role": user.get("role", "user"),
        "metadata": user.get("user_metadata", {}),
    }


@router.get("/status")
async def auth_status(request: Request):
    """Return whether auth is enabled and user is authenticated."""
    user = getattr(request.state, "user", None)
    return {
        "authenticated": user is not None,
        "user_id": getattr(request.state, "user_id", None),
    }

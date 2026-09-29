import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from auth import hash_password, verify_password
from database import Comment, Membership, Post, User, get_db, init_db

app = FastAPI(title="CampusTea", description="A college micro-community MVP")
BASE_DIR = Path(__file__).parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# SESSION_SECRET signs the login cookie so it can't be tampered with. Set a
# real secret via an environment variable before deploying this anywhere
# public; the fallback here is only fine for local learning/testing.
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "dev-secret-change-me"))

init_db()

COLLEGES = [
    "KCC Institute of Legal and Higher Education",
]

COMMUNITIES = [
    {"id": "campus-life", "name": "Campus Life", "category": "Around campus", "icon": "☀️", "description": "Everyday campus updates, questions, and conversations."},
    {"id": "study-room", "name": "Study Room", "category": "Study", "icon": "📚", "description": "Find a study partner, share notes, and stay focused."},
    {"id": "tech-club", "name": "Tech & Projects", "category": "Build together", "icon": "💻", "description": "Hackathons, coding questions, and project teammates."},
    {"id": "foodies", "name": "Campus Foodies", "category": "Around campus", "icon": "🍜", "description": "Good food, café finds, and what's worth ordering."},
    {"id": "weekend-plans", "name": "Weekend Plans", "category": "Meet up", "icon": "🎟️", "description": "Make a plan with people who are free this weekend."},
    {"id": "internships", "name": "Internships & Gigs", "category": "Opportunities", "icon": "🚀", "description": "Share openings, ask for advice, and prepare together."},
]
COMMUNITY_IDS = {item["id"] for item in COMMUNITIES}


class SignupInput(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=6, max_length=100)
    display_name: str = Field(min_length=1, max_length=40)
    college: str


class LoginInput(BaseModel):
    username: str
    password: str


class PostInput(BaseModel):
    community_id: str
    text: str = Field(min_length=1, max_length=500)


class CommentInput(BaseModel):
    text: str = Field(min_length=1, max_length=300)


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    bio: str = Field(default="", max_length=120)


class CollegeInput(BaseModel):
    college: str


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    user_id = request.session.get("user_id")
    if user_id is None:
        return None
    return db.get(User, user_id)


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = current_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Please log in first")
    return user


def initials_for(name: str) -> str:
    return "".join(part[0] for part in name.split()[:2]).upper()


def serialize_post(post: Post) -> dict:
    return {
        "id": post.id,
        "community_id": post.community_id,
        "author": post.author.display_name,
        "initials": initials_for(post.author.display_name),
        "time": post.created_at.strftime("%b %d, %I:%M %p"),
        "text": post.text,
        "likes": post.likes,
        "comments": len(post.comments),
        "color": ["mint", "peach", "lavender", "sky"][post.id % 4],
    }


def serialize_comment(comment: Comment) -> dict:
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "author": comment.author.display_name,
        "initials": initials_for(comment.author.display_name),
        "time": comment.created_at.strftime("%b %d, %I:%M %p"),
        "text": comment.text,
    }


@app.get("/")
def home():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.post("/api/auth/signup")
def signup(payload: SignupInput, request: Request, db: Session = Depends(get_db)):
    if payload.college not in COLLEGES:
        raise HTTPException(status_code=422, detail="Choose a valid college")
    username = payload.username.strip().lower()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="That username is already taken")
    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        college=payload.college,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    request.session["user_id"] = user.id
    return {"id": user.id, "username": user.username}


@app.post("/api/auth/login")
def login(payload: LoginInput, request: Request, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    user = db.query(User).filter(User.username == username).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    request.session["user_id"] = user.id
    return {"id": user.id, "username": user.username}


@app.post("/api/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/initial")
def initial_data(user: User | None = Depends(current_user), db: Session = Depends(get_db)):
    if user is None:
        return {"authenticated": False, "colleges": COLLEGES}

    joined = {row.community_id for row in user.memberships}
    # Posts are scoped to the user's own college, so "everyone can see it"
    # means everyone at the same campus — not the entire app.
    posts = (
        db.query(Post)
        .join(User, Post.user_id == User.id)
        .filter(User.college == user.college)
        .order_by(Post.created_at.desc())
        .all()
    )
    # Real member counts: how many students at this campus joined each community.
    member_counts = dict(
        db.query(Membership.community_id, func.count(Membership.id))
        .join(User, Membership.user_id == User.id)
        .filter(User.college == user.college)
        .group_by(Membership.community_id)
        .all()
    )
    return {
        "authenticated": True,
        "colleges": COLLEGES,
        "communities": COMMUNITIES,
        "posts": [serialize_post(post) for post in posts],
        "member_counts": member_counts,
        "joined": sorted(joined),
        "profile": {"name": user.display_name, "bio": user.bio},
        "college": user.college,
    }


@app.put("/api/college")
def set_college(payload: CollegeInput, user: User = Depends(require_user), db: Session = Depends(get_db)):
    if payload.college not in COLLEGES:
        raise HTTPException(status_code=422, detail="Choose a valid college")
    user.college = payload.college
    db.commit()
    return {"college": user.college}


@app.post("/api/communities/{community_id}/join")
def toggle_join(community_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    if community_id not in COMMUNITY_IDS:
        raise HTTPException(status_code=404, detail="Community not found")
    existing = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.community_id == community_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"joined": False}
    db.add(Membership(user_id=user.id, community_id=community_id))
    db.commit()
    return {"joined": True}


@app.post("/api/posts")
def create_post(payload: PostInput, user: User = Depends(require_user), db: Session = Depends(get_db)):
    if payload.community_id not in COMMUNITY_IDS:
        raise HTTPException(status_code=404, detail="Community not found")
    is_member = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.community_id == payload.community_id)
        .first()
    )
    if not is_member:
        raise HTTPException(status_code=400, detail="Join this community before posting")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Post cannot be empty")
    post = Post(user_id=user.id, community_id=payload.community_id, text=text)
    db.add(post)
    db.commit()
    db.refresh(post)
    return serialize_post(post)


@app.post("/api/posts/{post_id}/like")
def like_post(post_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if post is None or post.author.college != user.college:
        raise HTTPException(status_code=404, detail="Post not found")
    post.likes += 1
    db.commit()
    return {"likes": post.likes}


@app.get("/api/posts/{post_id}/comments")
def list_comments(post_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if post is None or post.author.college != user.college:
        raise HTTPException(status_code=404, detail="Post not found")
    return [serialize_comment(comment) for comment in post.comments]


@app.post("/api/posts/{post_id}/comments")
def add_comment(post_id: int, payload: CommentInput, user: User = Depends(require_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if post is None or post.author.college != user.college:
        raise HTTPException(status_code=404, detail="Post not found")
    is_member = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.community_id == post.community_id)
        .first()
    )
    if not is_member:
        raise HTTPException(status_code=400, detail="Join this community before replying")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Reply cannot be empty")
    comment = Comment(post_id=post_id, user_id=user.id, text=text)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return serialize_comment(comment)


@app.put("/api/profile")
def update_profile(payload: ProfileInput, user: User = Depends(require_user), db: Session = Depends(get_db)):
    user.display_name = payload.name.strip()
    user.bio = payload.bio.strip()
    db.commit()
    return {"name": user.display_name, "bio": user.bio}

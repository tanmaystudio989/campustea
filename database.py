"""Database setup for CampusTea.

Uses SQLite locally (one file, nothing to install or configure) but switches
to Postgres automatically when a DATABASE_URL environment variable is set —
which is exactly what hosting platforms like Render and Railway provide once
you attach a Postgres database. Nothing else in this file, or in main.py,
needs to change between the two.
"""

import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import ForeignKey, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

BASE_DIR = Path(__file__).parent

_env_url = os.environ.get("DATABASE_URL")
if _env_url:
    # Some hosts (Render, Heroku) hand out URLs starting "postgres://", and
    # SQLAlchemy needs "postgresql://". We also pin the driver to psycopg2
    # (+psycopg2) explicitly — otherwise SQLAlchemy may try the newer
    # "psycopg" v3 driver, which isn't installed (we ship psycopg2-binary).
    DATABASE_URL = _env_url.replace("postgres://", "postgresql://", 1)
    if "+psycopg2" not in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    connect_args = {}
else:
    DATABASE_URL = f"sqlite:///{BASE_DIR / 'campustea.db'}"
    # check_same_thread=False is needed because FastAPI can use a different
    # thread per request; SQLAlchemy's session handling keeps this safe.
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True, index=True)
    password_hash: Mapped[str]
    display_name: Mapped[str]
    bio: Mapped[str] = mapped_column(default="")
    college: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    posts: Mapped[list["Post"]] = relationship(
        back_populates="author", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="author", cascade="all, delete-orphan"
    )


class Membership(Base):
    """Which communities a user has joined."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "community_id", name="uq_user_community"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    community_id: Mapped[str]

    user: Mapped["User"] = relationship(back_populates="memberships")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    community_id: Mapped[str]
    text: Mapped[str]
    likes: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    author: Mapped["User"] = relationship(back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", order_by="Comment.created_at"
    )


class Comment(Base):
    """A reply on a post."""

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    post: Mapped["Post"] = relationship(back_populates="comments")
    author: Mapped["User"] = relationship(back_populates="comments")


def init_db() -> None:
    """Create the tables if they don't exist yet. Safe to call every startup."""
    Base.metadata.create_all(engine)


def get_db():
    """FastAPI dependency that hands each request its own DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

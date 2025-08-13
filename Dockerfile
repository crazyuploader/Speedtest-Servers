#
# Created by Jugal Kishore -- 2025
#
# Using Python 3.13
FROM python:3.13.6-slim

# Set Time Zone to IST
ENV TZ="Asia/Kolkata"

# Add required apt packages
RUN apt-get update && \
    apt-get install --yes --no-install-recommends \
    curl ca-certificates wget \
    rm -rf /var/lib/apt/lists/* /tmp/*

# Set Working Directory
WORKDIR /app

# Copy File(s)
COPY . /app

# Installing Package(s)
RUN pip3 install --upgrade pip

# Copy uv binaries from its Docker Image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Add user
RUN groupadd --system netvizgroup && useradd --system --gid netvizgroup netvizuser --create-home

# Set ownership of /app to the new user
RUN chown -R netvizuser:netvizgroup /app

# Switch to the non-root user
USER netvizuser 

# Install Dependencies
RUN uv sync --frozen --no-install-project --no-dev --python-preference=only-system

# Expose Port
EXPOSE 8202

CMD ["uv", "run", "gunicorn", "--workers", "4", "--bind", "0.0.0.0:8202", "app:app", "--access-logfile", "-", "--error-logfile", "-"]

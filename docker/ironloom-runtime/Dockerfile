FROM rust:1.92-alpine3.23 AS builder

WORKDIR /workspace
RUN apk add --no-cache musl-dev
COPY . .
RUN cargo build --release -p ironloom-runtime --bin ironloom

FROM alpine:3.24

LABEL org.opencontainers.image.title="Ironloom" \
      org.opencontainers.image.description="Rust supervisor runtime for auditable engineering operations" \
      org.opencontainers.image.source="https://github.com/VannaDii/ironloom" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Veritas Labs"

RUN apk add --no-cache ca-certificates tini \
    && addgroup -S ironloom \
    && adduser -S -G ironloom -h /var/lib/ironloom ironloom

COPY --from=builder /workspace/target/release/ironloom /usr/local/bin/ironloom
COPY docker/ironloom-runtime/entrypoint.sh /usr/local/bin/ironloom-entrypoint

RUN chmod 0755 /usr/local/bin/ironloom /usr/local/bin/ironloom-entrypoint \
    && mkdir -p /var/lib/ironloom/.ironloom /var/lib/ironloom/worktrees \
    && chown -R ironloom:ironloom /var/lib/ironloom

USER ironloom
WORKDIR /var/lib/ironloom
VOLUME ["/var/lib/ironloom/.ironloom", "/var/lib/ironloom/worktrees"]
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/ironloom-entrypoint"]

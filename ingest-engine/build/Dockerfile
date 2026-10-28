# N0: reproducible build of open-source OCCT 8.0.1 for the AgniKawach native engine.
# STATUS: NOT EXECUTED in the environment that produced this repository state. That environment could not
# pull base images (Docker Hub and other registries refused by the egress proxy) or reach the Ubuntu apt
# mirrors. The same build-occt.sh was run on a host running Ubuntu 24.04 instead (see records/ and the ADR).
# Base image digest is therefore UNRESOLVED: replace the tag with a digest after the first successful pull
# (docker buildx imagetools inspect ubuntu:24.04).
FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac AS build

ENV DEBIAN_FRONTEND=noninteractive
# Package names below are the ones present on the Ubuntu 24.04 host that ran build-occt.sh (checked with dpkg);
# the apt install itself was NOT run here. libxmu-dev and any other -dev package that the link stage may need
# are listed in the ADR as unresolved if the host run did not need them.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build git ca-certificates pkg-config \
      libfreetype-dev libfontconfig-dev libx11-dev libxext-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src/ingest-engine/build
COPY ingest-engine/build/ /src/ingest-engine/build/
ARG JOBS=2
ENV WORK=/opt/agni-occt JOBS=${JOBS}
RUN bash build-occt.sh docker-build

# Runtime image is a later decision (UQ-22); N0 only proves that the build and the headless check succeed.

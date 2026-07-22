# ACS Community image + the ADF Download Manager streaming repository addon.
#
# The addon is a separate project, published at
#   https://github.com/aborroy/alfresco-download-streaming-repo
# This Dockerfile fetches its prebuilt JAR from a GitHub release, so no local
# Maven build or source checkout is needed before `docker compose up`.
#
# The addon is a plain repository JAR (headless — no UI). Dropped into the
# repository web-app lib dir, ACS loads its web script + Spring context on
# start-up, exposing:
#   GET|HEAD /alfresco/s/adf-download-manager/download/{nodeId}
# which streams content from the content store honouring HTTP Range — defeating
# the ~1 GB single-allocation download ceiling at the source.

ARG ACS_TAG=26.1.0
ARG ADDON_VERSION=1.0.0
ARG ADDON_JAR_URL=https://github.com/aborroy/alfresco-download-streaming-repo/releases/download/v${ADDON_VERSION}/alfresco-download-streaming-repo-${ADDON_VERSION}.jar

FROM alfresco/alfresco-content-repository-community:${ACS_TAG}
ARG ADDON_JAR_URL

# Tomcat web-app lib for the alfresco.war (repository) — module JARs here are
# picked up by the Alfresco module subsystem on start-up. `ADD` from a URL
# defaults to root:root 0600, which the `alfresco` runtime user can't read —
# --chown/--chmod make it readable by the image's actual runtime user.
ADD --chown=alfresco:Alfresco --chmod=644 ${ADDON_JAR_URL} /usr/local/tomcat/webapps/alfresco/WEB-INF/lib/alfresco-download-streaming-repo.jar

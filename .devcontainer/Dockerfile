FROM node:18

# Install basic development tools
RUN apt update && apt install -y less man-db sudo

# Ensure default `node` user has access to `sudo`
ARG USERNAME=node
RUN echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Install npm packages
RUN sudo npm install -g zenn-cli@latest \
                        textlint \
                        textlint-rule-preset-ja-technical-writing \
                        textlint-rule-preset-ja-spacing \
                        textlint-rule-prh \
                        @proofdict/textlint-rule-proofdict \
                        && mkdir '/usr/local/lib/node_modules/textlint/.cache' \
                        && mkdir '/usr/local/lib/.cache' && chown node:node '/usr/local/lib/.cache'

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true
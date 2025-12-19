# Vibey - Offline-first AI Coding Agent

Vibey is an autonomous AI coding agent for VS Code that works offline-first with local LLMs. This repository contains the complete codebase and deployment infrastructure for running Vibey locally via Docker or on DigitalOcean using Terraform.

## 🚀 Quick Start (Local Docker)

### Prerequisites
- Docker Desktop installed and running
- VS Code with Vibey extension installed

### Setup Steps
1. Clone this repository
2. Open terminal in the project root
3. Run:
```bash
docker-compose up -d
```
4. Wait for containers to start (check logs with `docker-compose logs -f`)
5. In VS Code:
   - Open Settings (Ctrl+,)
   - Set `vibey.provider` to `ollama`
   - Set `vibey.model` to `Qwen3-coder:latest`
   - Set `vibey.ollamaUrl` to `http://localhost:11434`
6. Start Vibey with the "Vibey: Start Agent" command

### Access Services
- Ollama API: http://localhost:11434
- Vibey Web Interface: http://localhost:3000

## ☁️ Production Deployment (DigitalOcean)

### Prerequisites
- DigitalOcean account with API token
- Terraform installed locally
- SSH key pair generated (`ssh-keygen`)
- Domain name (optional)

### Setup Steps
1. Copy your DigitalOcean API token to a file:
```bash
echo "your-api-token-here" > do_token.txt
```
2. Set up your domain (optional):
```bash
echo "your-domain.com" > domain_name.txt
```
3. Navigate to terraform directory:
```bash
cd terraform
```
4. Initialize Terraform:
```bash
terraform init
```
5. Plan deployment:
```bash
terraform plan -var="do_token=$(cat ../do_token.txt)" -var="domain_name=$(cat ../domain_name.txt 2>/dev/null || echo '')"
```
6. Apply deployment:
```bash
terraform apply -var="do_token=$(cat ../do_token.txt)" -var="domain_name=$(cat ../domain_name.txt 2>/dev/null || echo '')"
```
7. Connect to your server:
```bash
ssh root@$(terraform output -raw server_ip)
```
8. On the server, install Docker and start Vibey:
```bash
# Install Docker
apt-get update && apt-get install -y docker.io
systemctl enable --now docker

# Create Vibey directory
mkdir -p /opt/vibey
cd /opt/vibey

# Download the VSIX extension
wget https://github.com/Senneseph/vibey/releases/latest/download/vibey-0.5.6.vsix

# Pull and run Vibey with Docker Compose
# Create docker-compose.yml
 cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  vibey:
    image: node:20-alpine
    container_name: vibey-agent
    volumes:
      - ./src:/app/src
      - ./dist:/app/dist
      - ./package.json:/app/package.json
      - ~/.vscode:/root/.vscode
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - NODE_ENV=production
      - VIBEY_PROVIDER=ollama
      - VIBEY_MODEL=Qwen3-coder:latest
      - VIBEY_OLLAMA_URL=http://ollama:11434
    ports:
      - "3000:3000"
    depends_on:
      - ollama
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    container_name: ollama-server
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped
    command: ["ollama", "serve"]

volumes:
  ollama_data:
EOF

# Start containers
docker-compose up -d
```

## 🔐 Security Notes

- The DigitalOcean firewall opens ports 22 (SSH), 11434 (Ollama), and 3000 (Vibey)
- For production, consider restricting access to specific IPs
- Use a reverse proxy (Nginx) with SSL for public exposure

## 🧹 Cleanup

### Local Docker
```bash
docker-compose down
```

### DigitalOcean
```bash
cd terraform
terraform destroy -var="do_token=$(cat ../do_token.txt)" -var="domain_name=$(cat ../domain_name.txt 2>/dev/null || echo '')"
```

## 💡 Tips

- For best performance, use a powerful machine with at least 8GB RAM
- Consider using `mistral` or `phi3` models if `Qwen3-coder` is too large
- Always test your configuration with "Vibey: Run Diagnostics" command
- The agent works autonomously - it will execute tools without asking for permission

> Vibey is designed to be fully autonomous. Once configured, it will gather information, plan, and execute tasks without requiring manual intervention.

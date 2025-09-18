#!/bin/bash

# =============================================================================
# Simplifyed Admin Dashboard - Ubuntu Server Installation Script
# =============================================================================
# 
# This script automates the complete installation of Simplifyed Admin Dashboard
# on Ubuntu Server 20.04+ with Nginx reverse proxy and SSL certificate setup.
# 
# Supports multiple applications on the same server with different domains.
#
# Features:
# - Multi-app support with domain-specific directories (/opt/apps/domain.com)
# - Automated port allocation (starts from 3000, auto-increments)
# - Individual PM2 configurations for each app instance
# - Domain-specific Nginx site configurations
# - Automated dependency installation (Node.js, PM2, Nginx)
# - Domain mapping with SSL certificate (Let's Encrypt)
# - Firewall configuration
# - Production environment setup
# - Automatic service startup
#
# Usage:
#   sudo chmod +x install-ubuntu.sh
#   sudo ./install-ubuntu.sh your-domain.com your-email@example.com
#
# Multiple apps example:
#   sudo ./install-ubuntu.sh admin.example.com admin@example.com
#   sudo ./install-ubuntu.sh dashboard.example.com admin@example.com
#   sudo ./install-ubuntu.sh trading.example.com admin@example.com
#
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=""
EMAIL=""
APP_NAME=""
APP_DIR=""
APP_PORT=""
APP_USER="simplifyed"
NODE_VERSION="18"
BASE_PORT=3000

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

validate_domain() {
    local domain=$1
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        log_error "Invalid domain format: $domain"
        exit 1
    fi
}

validate_email() {
    local email=$1
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        log_error "Invalid email format: $email"
        exit 1
    fi
}

setup_app_config() {
    log_info "Setting up application configuration..."
    
    # Create app name from domain (replace dots and hyphens with underscores)
    APP_NAME=$(echo "$DOMAIN" | sed 's/[.-]/_/g')
    
    # Create domain-specific directory
    APP_DIR="/opt/apps/$DOMAIN"
    
    log_info "Application name: $APP_NAME"
    log_info "Application directory: $APP_DIR"
    log_success "Application configuration set up"
}

find_available_port() {
    log_info "Finding available port..."
    
    local port=$BASE_PORT
    while netstat -tlnp 2>/dev/null | grep -q ":$port "; do
        port=$((port + 1))
    done
    
    APP_PORT=$port
    log_info "Assigned port: $APP_PORT"
    log_success "Available port found: $APP_PORT"
}

# =============================================================================
# Installation Functions
# =============================================================================

update_system() {
    log_info "Updating system packages..."
    apt update -y
    apt upgrade -y
    log_success "System updated successfully"
}

install_dependencies() {
    log_info "Installing system dependencies..."
    apt install -y curl wget git build-essential software-properties-common ufw nginx certbot python3-certbot-nginx sqlite3
    log_success "System dependencies installed"
}

install_nodejs() {
    log_info "Installing Node.js $NODE_VERSION..."
    
    # Remove existing Node.js installations
    apt remove -y nodejs npm || true
    
    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    
    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)
    log_success "Node.js $node_version and npm $npm_version installed"
}

install_pm2() {
    log_info "Installing PM2 process manager..."
    npm install -g pm2
    pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
    log_success "PM2 installed successfully"
}

create_app_user() {
    log_info "Creating application user: $APP_USER"
    
    if id "$APP_USER" &>/dev/null; then
        log_warning "User $APP_USER already exists"
    else
        useradd -m -s /bin/bash $APP_USER
        usermod -aG sudo $APP_USER
        log_success "User $APP_USER created"
    fi
}

setup_application() {
    log_info "Setting up Simplifyed Admin application..."
    
    # Create application directory
    mkdir -p $APP_DIR
    cd $APP_DIR
    
    # Clone or copy application (assuming it's already downloaded)
    log_info "Downloading application from GitHub..."
    git clone https://github.com/jabez4jc/Simplifyed-Admin.git .
    
    # Create backend environment file
    log_info "Creating production environment configuration..."
    cat > backend/.env << EOF
NODE_ENV=production
PORT=$APP_PORT
BASE_URL=https://$DOMAIN
FRONTEND_URL=https://$DOMAIN
SESSION_SECRET=$(openssl rand -hex 32)
EOF
    
    # Create PM2 ecosystem file for this specific instance
    log_info "Creating PM2 ecosystem configuration..."
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: 'backend/server.js',
    cwd: '$APP_DIR',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    }
  }]
};
EOF
    
    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd backend
    npm ci --only=production
    
    # Create database directory with proper permissions
    mkdir -p database
    chown -R $APP_USER:$APP_USER $APP_DIR
    
    log_success "Application setup completed"
}

configure_nginx() {
    log_info "Configuring Nginx reverse proxy..."
    
    # Remove default site (only on first installation)
    if [ ! -f /etc/nginx/sites-available/default.backup ]; then
        cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup 2>/dev/null || true
        rm -f /etc/nginx/sites-enabled/default
    fi
    
    # Create domain-specific site configuration
    cat > /etc/nginx/sites-available/$DOMAIN << EOF
# Simplifyed Admin Dashboard - Nginx Configuration
server {
    listen 80;
    server_name $DOMAIN;
    
    # Redirect HTTP to HTTPS (will be handled by Certbot)
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL Configuration (certificates will be added by Certbot)
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Root directory for frontend static files
    root $APP_DIR/frontend;
    index index.html;
    
    # Frontend static files
    location / {
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Authentication routes
    location /auth/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    
    # Test nginx configuration
    nginx -t
    
    log_success "Nginx configured successfully"
}

setup_ssl() {
    log_info "Setting up SSL certificate with Let's Encrypt..."
    
    # Stop nginx temporarily for standalone cert acquisition
    systemctl stop nginx
    
    # Obtain SSL certificate
    certbot certonly --standalone --non-interactive --agree-tos --email $EMAIL -d $DOMAIN
    
    # Configure automatic renewal
    cat > /etc/cron.d/certbot-renewal << EOF
# Automatic SSL certificate renewal for Simplifyed Admin
0 3 * * * root certbot renew --quiet --nginx --post-hook "systemctl reload nginx"
EOF
    
    # Start nginx
    systemctl start nginx
    systemctl reload nginx
    
    log_success "SSL certificate installed and configured"
}

configure_firewall() {
    log_info "Configuring UFW firewall..."
    
    # Reset firewall
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (important!)
    ufw allow ssh
    
    # Allow HTTP and HTTPS
    ufw allow 'Nginx Full'
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured successfully"
}

setup_services() {
    log_info "Setting up system services..."
    
    # Start and enable Nginx
    systemctl enable nginx
    systemctl start nginx
    
    # Setup PM2 for the app user
    cd $APP_DIR
    sudo -u $APP_USER PM2_HOME=/home/$APP_USER/.pm2 pm2 start ecosystem.config.js --env production
    sudo -u $APP_USER PM2_HOME=/home/$APP_USER/.pm2 pm2 save
    
    # Enable PM2 startup
    env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
    
    log_success "Services configured and started"
}

create_google_oauth_setup() {
    log_info "Creating Google OAuth setup instructions..."
    
    cat > $APP_DIR/GOOGLE_OAUTH_SETUP.md << EOF
# Google OAuth Configuration for Simplifyed Admin

## Required Steps:

1. **Go to Google Cloud Console**: https://console.cloud.google.com/

2. **Create a new project** or select existing project

3. **Enable Google+ API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it

4. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Name: "Simplifyed Admin Dashboard"
   - Authorized JavaScript origins: https://$DOMAIN
   - Authorized redirect URIs: https://$DOMAIN/auth/google/callback

5. **Download the credentials**:
   - Download the JSON file
   - Rename it to: client_secret_SimplifyedAdmin.apps.googleusercontent.com.json
   - Upload it to: $APP_DIR/backend/

6. **Restart the application**:
   \`\`\`bash
   sudo -u $APP_USER PM2_HOME=/home/$APP_USER/.pm2 pm2 restart simplifyed-trading
   \`\`\`

## Security Notes:
- Keep the OAuth credentials file secure
- Only authorized users will be able to access the dashboard
- The first user to login will become an admin automatically

## Application URL:
https://$DOMAIN

EOF
    
    chown $APP_USER:$APP_USER $APP_DIR/GOOGLE_OAUTH_SETUP.md
    log_success "Google OAuth setup instructions created"
}

# =============================================================================
# Main Installation Process
# =============================================================================

main() {
    log_info "Starting Simplifyed Admin Dashboard installation..."
    
    # Parse arguments
    if [ $# -ne 2 ]; then
        echo "Usage: $0 <domain> <email>"
        echo "Example: $0 trading.yourdomain.com admin@yourdomain.com"
        exit 1
    fi
    
    DOMAIN=$1
    EMAIL=$2
    
    # Validate inputs
    validate_domain $DOMAIN
    validate_email $EMAIL
    
    log_info "Domain: $DOMAIN"
    log_info "Email: $EMAIL"
    
    # Confirm installation
    read -p "Continue with installation? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    
    # Run installation steps
    check_root
    update_system
    install_dependencies
    install_nodejs
    create_app_user
    install_pm2
    setup_app_config
    find_available_port
    setup_application
    configure_nginx
    setup_ssl
    configure_firewall
    setup_services
    create_google_oauth_setup
    
    # Final success message
    echo
    log_success "🎉 Simplifyed Admin Dashboard installation completed!"
    echo
    echo "📋 Next Steps:"
    echo "1. Set up Google OAuth credentials (see $APP_DIR/GOOGLE_OAUTH_SETUP.md)"
    echo "2. Access your dashboard at: https://$DOMAIN"
    echo "3. The first user to login will become an admin"
    echo
    echo "📁 Important Files:"
    echo "   • Application: $APP_DIR"
    echo "   • Nginx config: /etc/nginx/sites-available/$DOMAIN"
    echo "   • Environment: $APP_DIR/backend/.env"
    echo "   • OAuth setup: $APP_DIR/GOOGLE_OAUTH_SETUP.md"
    echo "   • PM2 config: $APP_DIR/ecosystem.config.js"
    echo
    echo "🔧 Management Commands:"
    echo "   • View logs: sudo -u $APP_USER PM2_HOME=/home/$APP_USER/.pm2 pm2 logs $APP_NAME"
    echo "   • Restart app: sudo -u $APP_USER PM2_HOME=/home/$APP_USER/.pm2 pm2 restart $APP_NAME"
    echo "   • Check status: sudo -u $APP_USER PM2_HOME=/home/$APP_USER/.pm2 pm2 status"
    echo "   • App running on port: $APP_PORT"
    echo
}

# =============================================================================
# Error Handling
# =============================================================================

trap 'log_error "Installation failed at line $LINENO. Exit code: $?"' ERR

# =============================================================================
# Run Main Function
# =============================================================================

main "$@"
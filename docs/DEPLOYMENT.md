# Simplifyed Admin Dashboard - Deployment Guide

> **Complete production deployment guide for Ubuntu Server with custom domain and SSL certificate**

[![Ubuntu](https://img.shields.io/badge/Ubuntu-20.04%2B-orange.svg)](https://ubuntu.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Nginx](https://img.shields.io/badge/Nginx-1.18%2B-brightgreen.svg)](https://nginx.org/)

## 🚀 Quick Start (Automated Installation)

### One-Command Installation

```bash
wget https://raw.githubusercontent.com/jabez4jc/Simplifyed-Admin/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh your-domain.com admin@yourdomain.com
```

**That's it!** Your Simplifyed Admin Dashboard will be running at `https://your-domain.com` with SSL certificate automatically configured.

### What the Script Does

The installation script performs the following actions:

1. **✅ System Preparation**
   - Updates Ubuntu packages
   - Installs required dependencies
   - Creates dedicated `simplifyed` user account

2. **✅ Application Stack**
   - Installs Node.js 18 (LTS)
   - Installs PM2 process manager
   - Downloads application from GitHub
   - Configures production environment

3. **✅ Web Server & SSL**
   - Installs and configures Nginx
   - Sets up reverse proxy with security headers
   - Obtains SSL certificate via Let's Encrypt
   - Configures automatic certificate renewal

4. **✅ Security & Firewall**
   - Configures UFW firewall rules
   - Sets up proper file permissions
   - Enables security headers

5. **✅ Service Management**
   - Configures auto-startup on system reboot
   - Starts all services
   - Provides management commands

---

## 📋 Prerequisites

### Server Requirements

- **Operating System**: Ubuntu Server 20.04 or later
- **Memory**: Minimum 1GB RAM (2GB recommended)
- **Storage**: At least 2GB free space
- **Network**: Public IP address
- **Access**: Root or sudo privileges

### Domain Setup

1. **Domain Registration**: Own a domain name
2. **DNS Configuration**: Point your domain to server IP
   ```bash
   # Example DNS records
   A     your-domain.com        → 123.456.789.123
   A     www.your-domain.com    → 123.456.789.123
   ```

3. **Port Access**: Ensure ports 80 and 443 are open
   ```bash
   # Check if ports are accessible
   sudo ufw status
   telnet your-server-ip 80
   telnet your-server-ip 443
   ```

---

## 🔧 Installation Process

### Step 1: Download Installation Script

```bash
# Log into your Ubuntu server
ssh user@your-server-ip

# Download the installation script
wget https://raw.githubusercontent.com/jabez4jc/Simplifyed-Admin/main/install-ubuntu.sh

# Make it executable
chmod +x install-ubuntu.sh

# Review the script (optional but recommended)
less install-ubuntu.sh
```

### Step 2: Run Installation

```bash
# Run with your domain and email
sudo ./install-ubuntu.sh trading.yourdomain.com admin@yourdomain.com

# Follow the prompts
# The script will ask for confirmation before proceeding
```

### Step 3: Installation Output

The script provides colored output to track progress:
- 🔵 **[INFO]** - Information messages
- 🟢 **[SUCCESS]** - Successful operations
- 🟡 **[WARNING]** - Warnings (non-critical)
- 🔴 **[ERROR]** - Critical errors

### Step 4: Google OAuth Setup

After installation completes:

```bash
# View OAuth setup instructions
cat /opt/simplifyed-admin/GOOGLE_OAUTH_SETUP.md

# Follow the instructions to:
# 1. Create Google Cloud project
# 2. Generate OAuth credentials
# 3. Upload credentials file
# 4. Restart application
```

---

## 📁 File Structure After Installation

```
/opt/simplifyed-admin/              # Main application directory
├── backend/                        # Backend Node.js application
│   ├── server.js                  # Main server file
│   ├── package.json               # Dependencies
│   ├── .env                       # Production environment
│   ├── public/                    # Static dashboard files
│   │   ├── dashboard.html         # Unified dashboard UI
│   │   └── dashboard.js           # Dashboard logic
│   └── database/                  # SQLite databases
├── install-ubuntu.sh              # Installation script
└── GOOGLE_OAUTH_SETUP.md          # OAuth configuration guide

/etc/nginx/sites-available/simplifyed-admin    # Nginx configuration
/etc/nginx/sites-enabled/simplifyed-admin      # Active site link
/etc/letsencrypt/live/your-domain.com/         # SSL certificates
```

---

## 🎛️ Management Commands

### Application Management

```bash
# Check application status
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 status

# View application logs
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 logs

# Restart application
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 restart simplifyed-trading

# Stop application
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 stop simplifyed-trading

# Reload application (zero downtime)
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 reload simplifyed-trading
```

### System Services

```bash
# Check Nginx status
sudo systemctl status nginx

# Restart Nginx
sudo systemctl restart nginx

# Reload Nginx configuration
sudo systemctl reload nginx

# Test Nginx configuration
sudo nginx -t
```

### SSL Certificate Management

```bash
# Check certificate status
sudo certbot certificates

# Renew certificates manually
sudo certbot renew

# Test automatic renewal
sudo certbot renew --dry-run

# View certificate expiry
openssl x509 -noout -dates -in /etc/letsencrypt/live/your-domain.com/cert.pem
```

### Firewall Management

```bash
# Check firewall status
sudo ufw status verbose

# Allow additional ports (if needed)
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 'Nginx Full' comment 'Web Server'

# Reset firewall (if needed)
sudo ufw --force reset
```

---

## 🔍 Monitoring & Health Checks

### Application Health

```bash
# Check if application is responding
curl -I https://your-domain.com/api/instances

# Check backend directly
curl -I http://localhost:3000/api/instances

# Monitor real-time logs
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 logs --follow
```

### System Health

```bash
# Check system resources
htop
free -h
df -h

# Check network connectivity
ping google.com
netstat -tlnp | grep :3000
netstat -tlnp | grep :443
```

### Database Health

```bash
# Check database files
ls -la /opt/simplifyed-admin/backend/database/

# Check database integrity
sqlite3 /opt/simplifyed-admin/backend/database/trading.db "PRAGMA integrity_check;"

# View database schema
sqlite3 /opt/simplifyed-admin/backend/database/trading.db ".schema"
```

---

## 🛠️ Troubleshooting

### Common Issues

#### 1. Domain Not Resolving

**Symptoms**: Can't access https://your-domain.com
```bash
# Check DNS resolution
nslookup your-domain.com
dig your-domain.com A

# Check if Nginx is running
sudo systemctl status nginx
```

**Solution**: Verify DNS records point to correct IP

#### 2. SSL Certificate Issues

**Symptoms**: Browser shows SSL warnings
```bash
# Check certificate status
sudo certbot certificates

# Check certificate validity
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

**Solution**: Renew certificate or check domain validation

#### 3. Application Not Starting

**Symptoms**: 502 Bad Gateway error
```bash
# Check PM2 status
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 status

# Check application logs
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 logs
```

**Solution**: Check environment variables and dependencies

#### 4. Google OAuth Not Working

**Symptoms**: Login button doesn't work or shows errors
```bash
# Check if OAuth credentials file exists
ls -la /opt/simplifyed-admin/backend/client_secret_*.json

# Check application logs for OAuth errors
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 logs | grep -i oauth
```

**Solution**: Follow Google OAuth setup instructions

### Log Locations

```bash
# Application logs
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 logs

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
sudo journalctl -f
```

---

## 🔒 Security Best Practices

### After Installation

1. **Change Default SSH Port** (Optional but recommended)
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Change Port 22 to Port 2222
   sudo systemctl restart ssh
   sudo ufw allow 2222/tcp
   sudo ufw delete allow ssh
   ```

2. **Set up Fail2Ban** (Recommended)
   ```bash
   sudo apt install fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

3. **Regular Updates**
   ```bash
   # Set up automatic security updates
   sudo apt install unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

4. **Monitor Access Logs**
   ```bash
   # Check for suspicious access
   sudo tail -f /var/log/nginx/access.log
   sudo grep "POST /auth" /var/log/nginx/access.log
   ```

### Security Headers

The installation script configures these security headers in Nginx:

```nginx
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

## 📈 Performance Optimization

### After Installation

1. **Database Optimization**
   ```bash
   # Enable WAL mode for better performance
   sqlite3 /opt/simplifyed-admin/backend/database/trading.db "PRAGMA journal_mode=WAL;"
   ```

2. **Nginx Caching** (Optional)
   ```bash
   # Edit Nginx configuration
   sudo nano /etc/nginx/sites-available/simplifyed-admin
   
   # Add caching configuration
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

3. **PM2 Clustering** (For high traffic)
   ```bash
   # Use multiple CPU cores
   sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 start ecosystem.config.js --env production -i max
   ```

---

## 🔄 Updates and Maintenance

### Application Updates

```bash
# Navigate to application directory
cd /opt/simplifyed-admin

# Pull latest changes from GitHub
sudo -u simplifyed git pull origin main

# Install any new dependencies
cd backend
sudo -u simplifyed npm install --only=production

# Restart application
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 restart simplifyed-trading
```

### System Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js (if needed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Update PM2 globally
sudo npm update -g pm2
```

### Database Backup

```bash
# Create database backup
sudo -u simplifyed sqlite3 /opt/simplifyed-admin/backend/database/trading.db ".backup /opt/simplifyed-admin/backup_$(date +%Y%m%d_%H%M%S).db"

# Create automated backup script
cat > /opt/simplifyed-admin/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/simplifyed-admin/backups"
mkdir -p $BACKUP_DIR
sqlite3 /opt/simplifyed-admin/backend/database/trading.db ".backup $BACKUP_DIR/trading_$(date +%Y%m%d_%H%M%S).db"
# Keep only last 7 days of backups
find $BACKUP_DIR -name "trading_*.db" -mtime +7 -delete
EOF

chmod +x /opt/simplifyed-admin/backup.sh

# Add to crontab for daily backups
echo "0 2 * * * /opt/simplifyed-admin/backup.sh" | sudo crontab -u simplifyed -
```

---

## 📞 Support & Resources

### Documentation
- **[Complete Guide](CLAUDE.md)**: Technical documentation
- **[Database Schema](DATABASE_SCHEMA.md)**: Database structure
- **[README](README.md)**: Project overview
- **[GitHub Repository](https://github.com/jabez4jc/Simplifyed-Admin)**: Source code

### Community Support
- **Issues**: [GitHub Issues](https://github.com/jabez4jc/Simplifyed-Admin/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jabez4jc/Simplifyed-Admin/discussions)
- **Email**: support@simplifyed.in

### Professional Support
For enterprise deployments, custom configurations, or professional support:
- **Email**: enterprise@simplifyed.in
- **Consultation**: Available for complex deployments

---

## ✅ Post-Installation Checklist

After running the installation script, verify:

- [ ] Website accessible at `https://your-domain.com`
- [ ] SSL certificate shows as valid (green lock icon)
- [ ] Login button redirects to Google OAuth
- [ ] Google OAuth credentials configured
- [ ] First user login creates admin account
- [ ] Dashboard loads without errors
- [ ] API endpoints respond correctly
- [ ] Services start automatically after reboot
- [ ] Firewall properly configured
- [ ] SSL certificate auto-renewal working

### Testing Commands

```bash
# Test website accessibility
curl -I https://your-domain.com

# Test API endpoints
curl -k https://your-domain.com/api/instances

# Test SSL certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com < /dev/null

# Test auto-startup (reboot and check)
sudo reboot
# After reboot:
sudo -u simplifyed PM2_HOME=/home/simplifyed/.pm2 pm2 status
```

---

**🎉 Congratulations!** Your Simplifyed Admin Dashboard is now running securely in production with SSL certificate and custom domain!

---

<div align="center">

**Made with ❤️ by the Simplifyed Team**

[Website](https://simplifyed.in) • [GitHub](https://github.com/jabez4jc/Simplifyed-Admin) • [Support](mailto:support@simplifyed.in)

</div>
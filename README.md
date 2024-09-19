1. Create Virtual Machine:

A. Choose Ubuntu Server 22.04 LTS - x64 Gen2

B. Standard_D2s_v3 - 2 vcpus, 8 GiB memory ($70.08/month)

C. Allow 80, 443, port 22 access (while you do setup). We will redirect port 80 to 443 with Caddy.

Follow the first two docs from LibreChat.

`su - <yourusername>` to the user you made during setup.

2. Install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

A. Create `Caddyfile` (`nano Caddyfile`) - Ensure your DNS records are pointing to the URL you want to use.

Caddyfile contents:

```bash
# Redirect HTTP to HTTPS
http://yoururlhere.com {
    redir https://mxlabs.yoururlhere.com{uri} 301
}

# HTTPS Configuration
https://yoururlhere.com {
    reverse_proxy http://localhost:3080 {
        header_up Host {http.reverse_proxy.upstream.hostport}
    }
}
```

Run Command: `sudo caddy start`

(Do `caddy reload` if you're updating the Caddyfile after starting the process. This is useful in production as it minimizes downtime.)

---

### Part I: Installing Docker and Other Dependencies

1. Update and Install Docker Dependencies:

```bash
sudo apt update
sudo apt install apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
```

_Note: Respond "Y" to all [Y/n] prompts and press ENTER on purple screens for default selections._

If at any point your console disconnects, do the following and then pick up where you left off:
- Access the console again as indicated above
- Switch to the user you created with `su - <yourusername>`

2. Add Docker Repository to APT Sources:

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo 'deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable' | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
```

3. Install Docker:

```bash
sudo apt install docker-ce
```

_Add your user to the Docker group for easier command execution:_

```bash
sudo usermod -aG docker $USER
sudo reboot
```

After rebooting, if using the browser droplet console, click reload and wait to get back into the console.

_Reminder: Any time you reboot with `sudo reboot`, switch to the user you setup again with `su - <yourusername>`._

4. Verify Docker is Running:

```bash
sudo systemctl status docker
```

5. Install the Latest Version of Docker Compose:

```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.26.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose -v
```

If you get a permission denied error, reboot/switch to your created user again, and run:

```bash
sudo chmod +x /usr/local/bin/docker-compose
```

_Note: Docker Compose v2 uses `docker compose`, not `docker-compose`. This guide will use the old commands, but you should be aware of the change._

6. Install Git and NPM:

```bash
sudo apt install git nodejs npm
```

Confirm installation:

```bash
git --version
node -v
npm -v
```

_Note: This will install some older versions, which are fine for this guide, but consider upgrading later._

---

### Part II: Setup LibreChat

1. Clone down the repo:

```bash
git clone https://github.com/YOURREPO.git
cd YOURPROJECT/
```

2. Set up your environment file:

```bash
cp .env.example .env
nano .env
```

_Update the following variables for added security (use [this replit link](https://replit.com/@daavila/crypto#index.js) to generate your own values):_

- `CREDS_IV`
- `CREDS_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

3. Edit LibreChat configuration:

- `librechat.yaml.example` ➡ `librechat.yaml`
- `.env.example` ➡ `.env`
- `docker-compose.override.yaml.example` ➡ `docker-compose.override.yaml`

- Update URL and keys in `.env`.

A. Replace `PGTOKEN` with your API Key, and set up Microsoft (https://www.librechat.ai/docs/configuration/authentication/OAuth2-OIDC/azure) /Google SSO.

B. Replace `DOMAIN_CLIENT` and `DOMAIN_SERVER` with your own URLs. 

C. Optionally, disable external signups by setting:

```bash
ALLOW_REGISTRATION=false
```

Also Edit librechat.yaml as needed and save it as librechat.yaml. Make sure to edit the API URL to match the API you are using if you are not using the main API from prediction guard. This is where you will also add and remove models as Prediction Guard adds support for better/updated models. 



4. Start Docker:

```bash
sudo systemctl start docker
docker info
sudo docker-compose -f ./deploy-compose.yml up -d
```

For future updates, simply run:

```bash
docker-compose up -d
```

If you edit anything besides YAML files, rebuild with:

```bash
docker-compose build --no-cache
docker compose up
```

### That's it!

You should now be able to see your chat at the domain specified in your Caddyfile. Be sure to close port 22 for security once setup is complete.


That's it! You should now be able to see your Chat at the domain you specified in your caddy file. Be sure to close port 22 after you are done setting up for security.  

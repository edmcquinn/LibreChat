1. Create Virtual Machine

A. Choose Ubuntu Server 22.04 LTS - x64 Gen2

B. Standard_D2s_v3 - 2 vcpus, 8 GiB memory ($70.08/month)

C. Allow 80, 443, port 22 access (while you do setup) We will redirect port 80 to 443 with Caddy.

Follow first two docs from librechat.

su - <yourusername> to your user you made during setup

2. Install Caddy:

sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

A. Create Caddyfile (nano Caddyfile) - Make sure your DNS records are pointing to the URL you want to use.

Caddyfile File contents:

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

Run Command: sudo caddy start

(Do caddy reload if you are just updating the Caddyfile after you've already started the process this is useful in production as you should have very little downtime)



Part I: Installing Docker and Other Dependencies:
There are many ways to setup Docker on Linux systems. I’ll walk you through the best and the recommended way based on this guide.

Note that the “Best” way for Ubuntu docker installation does not mean the “fastest” or the “easiest”. It means, the best way to install it for long-term benefit (i.e. faster updates, security patches, etc.).

1. Update and Install Docker Dependencies
First, let’s update our packages list and install the required docker dependencies.

sudo apt update

Then, use the following command to install the dependencies or pre-requisite packages.

sudo apt install apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release

Installation Notes
Input “Y” for all [Y/n] (yes/no) terminal prompts throughout this entire guide.
After the first [Y/n] prompt, you will get the first of a few purple screens asking to restart services.
Each time this happens, you can safely press ENTER for the default, already selected options:
image

If at any point your console disconnects, do the following and then pick up where you left off:
Access the console again as indicated above
Switch to the user you created with su - <yourusername>

2. Add Docker Repository to APT Sources
While installing Docker Engine from Ubuntu repositories is easier, adding official docker repository gives you faster updates. Hence why this is the recommended method.

First, let us get the GPG key which is needed to connect to the Docker repository. To that, use the following command.

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

Next, add the repository to the sources list. While you can also add it manually, the command below will do it automatically for you.

echo 'deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable' | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

The above command will automatically fill in your release code name (jammy for 22.04, focal for 20.04, and bionic for 18.04).

Finally, refresh your packages again.

sudo apt update

If you forget to add the GPG key, then the above step would fail with an error message. Otherwise, let’s get on with installing Docker on Ubuntu.

3. Install Docker
What is the difference between docker.io and docker-ce?

docker.io is the docker package that is offered by some popular Linux distributions (e.g. Ubuntu/Debian). docker-ce on the other hand, is the docker package from official Docker repository. Typically docker-ce more up-to-date and preferred.

We will now install the docker-ce (and not docker.io package)

sudo apt install docker-ce

Purple screen means press ENTER. :)

Recommended: you should make sure the created user is added to the docker group for seamless use of commands:

sudo usermod -aG docker $USER

Now let’s reboot the system to make sure all is well.

sudo reboot

After rebooting, if using the browser droplet console, you can click reload and wait to get back into the console.

Reminder: Any time you reboot with sudo reboot, you should switch to the user you setup as before with su - <yourusername>.

4. Verify that Docker is Running on Ubuntu
There are many ways to check if Docker is running on Ubuntu. One way is to use the following command:

sudo systemctl status docker

You should see an output that says active (running) for status.

Exit this log by pressing CTRL (or CMD) + C.

5. Install the Latest Version of Docker Compose
The version of docker-compose packaged with the Linux distribution is probably old and will not work for us.

Checking the releases on the Docker Compose GitHub, the last release is v2.26.1 (as of 4/6/24).

You will have to manually download and install it. But fear not, it is quite easy.

First, download the latest version of Docker Compose using the following command:

sudo curl -L https://github.com/docker/compose/releases/download/v2.26.1/docker-compose-'uname -s'-'uname -m' -o /usr/local/bin/docker-compose

Next, make it executable using the following command:

sudo chmod +x /usr/local/bin/docker-compose

Docker Compose should now be installed on your Ubuntu system. Let’s check to be sure.

docker-compose -v
# output should be: Docker Compose version v2.20.2

If you get a permission denied error, like I did, reboot/switch to your created user again, and run sudo chmod +x /usr/local/bin/docker-compose again

Note on Docker Compose Commands
As of Docker Compose v2, docker-compose is now docker compose. This guide will use the old commands for now, but you should be aware of this change and that docker compose is often preferred.

6. As part of this guide, I will recommend you have git and npm installed:
Though not technically required, having git and npm will make installing/updating very simple:

sudo apt install git nodejs npm

Cue the matrix lines.

You can confirm these packages installed successfully with the following:

git --version
node -v
npm -v

Note: this will install some pretty old versions, for npm in particular. For the purposes of this guide, however, this is fine, but this is just a heads up in case you try other things with node in the droplet. Do look up a guide for getting the latest versions of the above as necessary.

Ok, now that you have set up the Droplet, you will now setup the app itself

Part II: Setup LibreChat
1. Clone down the repo
From the droplet commandline (as your user, not root):

# clone down the your repository
git clone https://github.com/YOURREPO.git

# enter the project directory
cd YOURPROJECT/

You will enter the editor screen, and you can paste the following:

Exit the editor with CTRL + X, then Y to save, and ENTER to confirm.

Environment (.env) File
The default values are enough to get you started and running the app, allowing you to provide your credentials from the web app.

# Copies the example file as your global env file
cp .env.example .env

However, it’s highly recommended you adjust the “secret” values from their default values for added security. The API startup logs will warn you if you don’t.

For convenience, you can fork & run this replit to generate your own values:

https://replit.com/@daavila/crypto#index.js

nano .env

# FIND THESE VARIABLES AND REPLACE THEIR DEFAULT VALUES!

# Must be a 16-byte IV (32 characters in hex)

CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb

# Must be 32-byte keys (64 characters in hex)

CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418

If you’d like to provide any credentials for all users of your instance to consume, you should add them while you’re still editing this file:

Files that need edited for prediction guard:

1. Edit librechat.yaml.example as needed and save it as librechat.yaml. Make sure to edit the API URL to match the API you are using.

2. Edit .env.example and save it as .env after editing your desired settings.

A. PLEASE MAKE SURE TO REPLACE THE PGTOKEN VARIABLE at bottom of file with your API Key. You will also need to setup your microsoft/google SSO by filling in the values.

B. Replace these values in the file with your own urls.

DOMAIN_CLIENT=http://localhost:3080 # use YOUR OWN DOMAIN HERE
DOMAIN_SERVER=http://localhost:3080 # use YOUR OWN DOMAIN HERE

C. You may also want to edit your SSO info which can be setup following these instructions for Entra: https://www.librechat.ai/docs/configuration/authentication/OAuth2-OIDC/azure

3. Edit docker-compose.override.example and save it as docker-compose.override.yaml

# if editing the .env file
nano .env

This is one such env variable to be mindful of. This disables external signups, in case you would like to set it after you’ve created your account.

ALLOW_REGISTRATION=false

As before, exit the editor with CTRL + X, then Y to save, and ENTER to confirm.

Run these commands after you have setup Caddy and started it or you'll have to deal with NGINX having port 443.
👇

3. Start docker
# should already be running, but just to be safe
sudo systemctl start docker

# confirm docker is running
docker info

Now we can start the app container. For the first time, we’ll use the full command and later we can use a shorthand command

sudo docker-compose -f ./deploy-compose.yml up -d"

After you run this command you should be able to just run docker compose up -d next time you edit anything. 

If you edit anything besides the YAML files you need to run this command to update the build. 

A. docker-compose build --no-cache
B. docker compose up


That's it! You should now be able to see your Chat at the domain you specified in your caddy file. Be sure to close port 22 after you are done setting up for security.  

# Push RouteMeet to GitHub and deploy to Azure

This guide uses your Azure for Students subscription and one Ubuntu VM. It preserves the existing SQLite database on the VM's persistent managed disk. The frontend and API share one HTTPS address. Docker runs Node 24; Caddy handles HTTPS. Keep one app instance because both SQLite storage and active searches currently belong to one server.

This is a small prototype deployment. VM compute, managed disks and the public IP consume credits. Check the portal's estimate before creating resources. Stopping/deallocating the VM stops compute billing, but retained disks and some other resources can still cost money. No Azure resources have been created by this setup.

## 1. Push from your Mac

The working repository is already connected to `muhammad3ilal/routemeet`. You do not need to create another repository or run `git init`.

Open Terminal and run:

```bash
cd /Users/muhammadbilal/Documents/2026-09-27/can/work/routemeet
git status
git add -A
git diff --cached --stat
git commit -m "Improve RouteMeet planning and add Azure deployment"
git push -u origin main
```

The deployment branch is `main`. Environment files, API keys stored in those files, local databases, dependencies and build output are ignored. If Git asks you to sign in, complete GitHub authentication on your computer. Use your own name and GitHub email as your commit identity.

Open [the GitHub repository](https://github.com/muhammad3ilal/routemeet) and confirm the latest commit and project files appear on `main`. The VM instructions below deploy that branch. A rejected push should be resolved by fetching and reviewing remote changes; do not force-push blindly.

## 2. Create the Azure VM

In [Azure Portal](https://portal.azure.com), choose **Virtual machines → Create → Azure virtual machine**:

| Setting | Value |
|---|---|
| Subscription | Your Azure for Students subscription |
| Resource group | A dedicated group, for example `routemeet-rg` |
| VM name | `routemeet-vm` |
| Image | Ubuntu Server 24.04 LTS, x64 |
| Size | A small available B-series size with at least 2 GiB RAM; use the portal's current cost estimate |
| Authentication | SSH public key; download and keep the private key on your Mac |
| OS disk | A regular persistent managed disk, such as Standard SSD; do not use an ephemeral OS disk |
| Public IP | Static public IP |

In Networking, allow TCP **80 and 443** for the website. Restrict TCP **22** (SSH) to your own public IP. The app's port 4000 stays inside Docker and does not need an inbound rule.

After creation, open the VM's **Public IP → Configuration**, choose a DNS name label, and save. Copy the actual resulting hostname from Azure; do not guess its suffix. You can use this Azure hostname without buying a domain. A custom domain can instead point an A record to the VM's static public IP. [Azure DNS-name instructions](https://learn.microsoft.com/en-us/azure/virtual-machines/custom-domain)

Do not place Docker data on the VM's temporary/resource disk or Azure Files. This setup uses a named Docker volume on the normal persistent OS disk under `/var/lib/docker`. It survives app/container rebuilds and VM restarts, but deleting that managed disk or explicitly deleting the Docker volume deletes the database. Back up data separately before such changes.

## 3. Connect and configure the VM

Use **VM → Connect → Native SSH** to get the command for your username, public IP and downloaded key. Run that command on your Mac. The commands below run **inside the Ubuntu VM**.

```bash
sudo apt-get update
sudo apt-get install -y git
git clone --branch main https://github.com/muhammad3ilal/routemeet.git
cd routemeet
sudo bash deploy/install-docker-ubuntu.sh
cp deploy/azure.env.example deploy/.env.azure
chmod 600 deploy/.env.azure
nano deploy/.env.azure
```

If the repository is private, authenticate Git with an appropriate read-only credential or SSH deploy key on the VM. Avoid embedding tokens in the clone URL. The included Docker installer is only for a fresh Ubuntu 24.04 VM; it uses Docker's official package repository. [Docker's installation guide](https://docs.docker.com/engine/install/ubuntu/)

Fill these values in the editor:

| Variable | What to enter |
|---|---|
| `APP_DOMAIN` | The exact Azure DNS hostname, without `https://`, a port or a slash |
| `VITE_MAPTILER_KEY` | A public browser MapTiler key, allowed to load from `https://YOUR_HOSTNAME` |
| `MAPTILER_API_KEY` | A separate server geocoding key; keep this out of frontend variables |
| `OSRM_URL` | Your routing endpoint; the example keeps the shared demo endpoint for limited evaluation |
| `OVERPASS_URL` | Your category-search endpoint; the example keeps the shared endpoint for limited evaluation |

The browser key is compiled into the frontend and is visible to visitors by design. Set its allowed HTTP origin in MapTiler Cloud to the final HTTPS site address. Keep the backend key server-only. Changing the browser key requires rebuilding; changing the hostname requires updating its allowed origin too. Existing local environment files are not uploaded by Git and do not automatically configure Azure.

The example endpoints are shared public services, not a production hosting plan. Arrange suitable hosted or self-managed routing and Overpass endpoints before inviting general public traffic. Their quotas/outages can interrupt place searches even while your Azure VM is healthy. Default app budgets remain 200 provider requests and 2,000 routing-matrix elements per day, shared across all visitors. [Map/provider setup](maptiler-setup.md)

## 4. Start the website

From the repository directory on the VM:

```bash
sudo bash deploy/azure.sh up -d --build
sudo bash deploy/azure.sh ps
sudo bash deploy/azure.sh logs --tail=80 app caddy
```

When DNS resolves to the VM and ports 80/443 are reachable, Caddy obtains and renews an HTTPS certificate. Open `https://YOUR_ACTUAL_HOSTNAME` in your browser. The health endpoint is `https://YOUR_ACTUAL_HOSTNAME/api/health`; it should return JSON with `"status":"ok"`. HTTPS is required for production ownership cookies. [Caddy HTTPS requirements](https://caddyserver.com/docs/quick-starts/https)

Check a place search, map loading and Apple Maps link, then save a test group and reload. To verify persistence, restart just the app and check the saved group from the same browser:

```bash
sudo bash deploy/azure.sh restart app
```

The Azure deployment starts with its own empty database. Localhost saved plans do not automatically move to the new hostname; their access cookie is tied to localhost. Active, unsaved searches also expire on every app restart and must be run again.

## 5. Deploy subsequent changes

Commit and push changes from the Mac. On the VM, on the branch you chose to deploy:

```bash
cd routemeet
git pull --ff-only
sudo bash deploy/azure.sh up -d --build
sudo bash deploy/azure.sh ps
```

Do not use `docker compose down -v`: `-v` deletes the persistent volumes. Updates rebuild the code while reusing those volumes. Maintain a database backup outside the VM; use SQLite's backup API or stop the app before copying the database together with any WAL state. A restart-safe volume is not a backup. [SQLite backup guidance](https://sqlite.org/backup.html)

This guide uses manual deployments after GitHub pushes. It does not install an automatic GitHub-to-Azure deployment workflow or create Azure credentials. For a larger public service, migrate persistence to a managed database and move in-memory searches/quotas to shared storage before using multiple replicas.

## Why this guide uses a VM

RouteMeet currently uses SQLite in WAL mode. Microsoft's App Service Linux guidance identifies its network-mounted storage as unsuitable for SQLite; putting this database in App Service `/home` is not a reliable drop-in deployment. SQLite WAL also cannot be used over a network filesystem. A VM's attached managed disk avoids that mismatch. App Service is an option after the database architecture changes. [Microsoft storage guidance](https://github.com/Azure/app-service-linux-docs/blob/master/Things_You_Should_Know/things_you_should_know.md#sqlite-and-other-file-based-databases-are-not-supported), [SQLite WAL](https://sqlite.org/wal.html), [Azure managed disks](https://learn.microsoft.com/en-us/azure/virtual-machines/managed-disks-overview)

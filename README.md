# ⚡ TaskFlow — Team Task Manager

A full-stack web application for managing projects, assigning tasks, and tracking team progress with role-based access control. Built as part of a startup assignment and deployed live on Railway.

🔗 **Live Demo:** [team-task-manager-production-3b5b.up.railway.app](https://team-task-manager-production-3b5b.up.railway.app)

---

## 📌 Introduction

TaskFlow is a real-world team collaboration tool where organizations can manage their projects end-to-end. Users sign up, create projects, invite team members with specific roles, assign tasks, and track progress — all from a clean, dark-themed dashboard.

The app enforces a strict organizational hierarchy so that each role only sees and manages the people below them. A Quality Lead cannot see Project Lead data, and an Intern can only see their own tasks. This mirrors how real companies operate.

---

## 🚀 Features

- **Authentication** — Secure signup and login with JWT tokens and bcrypt password hashing
- **Per-Project Roles** — The same person can be a Project Lead in one project and an Intern in another
- **Role-Based Hierarchy** — HR → Project Lead → Quality Lead → Intern
- **Role-Based Visibility** — Each role only sees members and tasks at their level or below
- **Project Management** — Create projects with a unique Project Code (e.g. WEB-01), add members, delete projects
- **Task Management** — Create, assign, update status, set priority and due dates
- **Task Tracker** — Live timer that tracks when you start and finish a task, with a "Finished Today" log
- **Dashboard** — Stats showing total tasks, completed, in progress, and overdue counts
- **Activity Log** — Managers can see who worked on what and for how long inside each project

---

## 🛠 Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | Node.js + Express | Lightweight, fast, JavaScript throughout |
| Database | SQLite (better-sqlite3) | No separate DB server needed, file-based |
| Authentication | JWT + bcrypt | Industry standard, stateless auth |
| Frontend | Vanilla HTML + CSS + JavaScript | No build tools, fast to develop |
| Deployment | Railway + Docker | Simple GitHub integration, free tier available |

### Why this stack?

We chose an all-JavaScript stack so there is no context switching between languages. SQLite was chosen over PostgreSQL or MongoDB because it requires zero setup — the database is a single file. For a first full-stack project under a 1-2 day deadline, this was the right call. The frontend uses plain HTML/CSS/JS instead of React so there is no build step and everything runs immediately.

---

## 🗄 Database Schema

```
users
  id, name, email, password, created_at

projects
  id, project_code (unique), name, description, owner_id, created_at

project_members
  id, project_id, user_id, role (hr/project_lead/quality_lead/intern), added_by

tasks
  id, title, description, status, priority, due_date,
  project_id, assignee_id, created_by, created_at

task_logs
  id, task_id, user_id, project_id, custom_task_title,
  started_at, finished_at, status (active/finished)
```

---

## 🔐 Role Hierarchy & Permissions

```
HR
 └── Project Lead
      └── Quality Lead
           └── Intern
```

| Action | HR | Project Lead | Quality Lead | Intern |
|--------|:--:|:------------:|:------------:|:------:|
| Create project | ✅ | ✅ | ✅ | ✅ |
| Add Project Lead to project | ✅ | ❌ | ❌ | ❌ |
| Add Quality Lead to project | ✅ | ✅ | ❌ | ❌ |
| Add Intern to project | ✅ | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ✅ | ❌ |
| Delete tasks | ✅ | ✅ | ❌ | ❌ |
| Use task tracker | ✅ | ✅ | ✅ | ✅ |
| View activity log | ✅ | ✅ | ✅ | ❌ |

---

## 📁 Project Structure

```
team-task-manager/
├── public/
│   ├── index.html          # Login & Signup page
│   └── dashboard.html      # Main app (Dashboard, Tracker, Projects)
├── src/
│   ├── db/
│   │   └── database.js     # SQLite setup & table creation
│   ├── middleware/
│   │   └── auth.js         # JWT verification middleware
│   └── routes/
│       ├── auth.js         # POST /api/auth/signup, /login
│       ├── projects.js     # CRUD for projects & members
│       ├── tasks.js        # CRUD for tasks + task logs
│       └── dashboard.js    # Aggregate stats for dashboard
├── Dockerfile              # Docker config for Railway deployment
├── railway.toml            # Railway deployment config
├── server.js               # Express app entry point
└── package.json
```

---

## ⚙️ REST API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login and receive JWT |

### Projects
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/projects` | Get all your projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/:id` | Get project + members |
| POST | `/api/projects/:id/members` | Add a member |
| DELETE | `/api/projects/:id` | Delete project (owner only) |

### Tasks
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/tasks/project/:id` | Get tasks (role-filtered) |
| POST | `/api/tasks/project/:id` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/log/start` | Start task timer |
| POST | `/api/tasks/log/finish/:id` | Finish task timer |
| GET | `/api/tasks/log/mine` | Get my active + today's finished |
| GET | `/api/tasks/log/project/:id` | Activity log for managers |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Stats + assigned tasks |

---

## 🚧 Difficulties Faced

### 1. Railway and better-sqlite3 Build Failure
The biggest deployment challenge was `better-sqlite3`, which is a native Node.js module that requires compiling C++ code during installation. Railway's default Nixpacks builder used Node 18 which was incompatible, and even after upgrading to Node 20, the build environment lacked Python and GCC which are needed for compilation.

**Solution:** We switched from Nixpacks to a custom `Dockerfile` using the `node:20-bullseye` base image, which includes build tools. We added `python3 make g++ gcc` via apt-get, and set `npm ci --include=optional` to ensure native binaries were built correctly.

### 2. Railway Volume Wiping the App
We added a Railway Volume for database persistence, but mounted it at `/app` — the same directory as the application code. Every time the container started, the volume mount would overwrite the entire `/app` directory, making `server.js` and all other files disappear, causing the "Cannot find module '/app/server.js'" error.

**Solution:** Deleted the volume entirely. For an assignment/demo, database persistence between deploys is not critical. The simpler fix was to remove the volume and store the database in `/tmp` during production.

### 3. Express Route Conflict with path-to-regexp
After upgrading to the latest version of Express, the catch-all route `app.get('*', ...)` stopped working and threw a `PathError` about missing parameter names. This is a breaking change introduced in newer versions of the `path-to-regexp` library that Express depends on.

**Solution:** Changed the wildcard route from `'*'` to `'/{*path}'` which is the new correct syntax.

### 4. Port Mismatch on Railway
The app was deployed and running, but returning 502 errors. The deploy logs showed `Server running on port 8080` while the Railway domain was configured to route to port 3000. Railway injects a `PORT` environment variable dynamically, and it had assigned port 8080.

**Solution:** Updated the Railway networking settings to point the public domain to port 8080 instead of 3000.

### 5. Incomplete Git Commits
During deployment debugging, some files were not making it into the GitHub repository because only specific changed files were being staged with `git add <filename>` instead of `git add -A`. This meant Railway was building an incomplete version of the codebase.

**Solution:** Always use `git add .` or `git add -A` before committing to ensure all files are included.

---

## 🏃 Running Locally

### Prerequisites
- Node.js v20+
- Git

### Steps

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/team-task-manager.git
cd team-task-manager

# Install dependencies
npm install

# Create environment file
echo "JWT_SECRET=yoursecretkey123" > .env
echo "PORT=3000" >> .env

# Start development server
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🌐 Deployment (Railway)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repository
4. Add environment variables: `JWT_SECRET`, `NODE_ENV=production`
5. Railway auto-detects the Dockerfile and builds
6. Go to Settings → Networking → Generate Domain
7. Note the port Railway assigns (check deploy logs) and update the domain port accordingly

---

## 👥 Test Accounts (for demo)

To test the full hierarchy, create 4 accounts and add them to the same project with different roles:

| Role | What to test |
|------|-------------|
| HR | Create project, add all roles, see everything |
| Project Lead | Add QLs and Interns, see their tasks |
| Quality Lead | Add Interns only, see only intern tasks |
| Intern | Use task tracker, see only own tasks |

---

## 📝 License

This project was built as an assignment submission. Feel free to use it as a reference.

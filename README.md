<div align="center">
<img width="1200" height="475" alt="ELECTROHACK 2.0 Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🔧 ELECTROHACK 2.0 - Inventory Management System

A modern, real-time inventory management system built for hackathon component tracking. Features team registration, component requests, admin approval workflows, and live inventory updates.

## ✨ Features

### For Participants
- 🎫 **Team Registration & Login** - Secure team authentication with auto-generated passwords
- 📦 **Component Browsing** - Browse available components by category
- 🛒 **Request Components** - Submit component requests with real-time availability checking
- 📊 **Track Requests** - Monitor request status (Pending, Approved, Collected, etc.)
- ✅ **View Collected Items** - See all components your team has collected

### For Administrators
- 👥 **Team Management** - View and manage registered teams
- 📋 **Request Management** - Approve, modify, or reject component requests
- 🔄 **Inventory Control** - Add/edit components with quantity tracking
- 📈 **Real-time Updates** - Live inventory synchronization across all users
- 🔙 **Return Components** - Reinstate returned components back to inventory
- 🗑️ **History Management** - Delete requests and restore stock automatically

### Technical Features
- ⚡ **Real-time Sync** - Automatic inventory recalculation on server restart
- 🔒 **Stock Reservation** - Prevents over-allocation of components
- 🎨 **Modern UI** - Futuristic design with neon accents and animations
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🌐 **RESTful API** - Clean backend architecture with Express.js

## 🛠️ Tech Stack

**Frontend:**
- React 18 with TypeScript
- React Router for navigation
- Tailwind CSS for styling
- Context API for state management

**Backend:**
- Node.js with Express.js
- MongoDB with Mongoose ODM
- RESTful API architecture
- CORS enabled for cross-origin requests

**Development:**
- Vite for fast development and building
- TypeScript for type safety
- Nodemon for auto-restart during development

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **MongoDB** - Either:
  - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (recommended for production)
  - [Local MongoDB installation](https://www.mongodb.com/try/download/community)
- **Git** - [Download here](https://git-scm.com/)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/inventory.electrohack2.0.git
cd inventory.electrohack2.0
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your configuration:

```env
# MongoDB Connection String
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/electrohack?retryWrites=true&w=majority

# Optional: Gemini API Key (if using AI features)
GEMINI_API_KEY=your_api_key_here

# Server Port (optional, defaults to 3000)
PORT=3000

# Node Environment
NODE_ENV=development
```

**Getting MongoDB URI:**
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Click "Connect" → "Connect your application"
4. Copy the connection string and replace `<username>` and `<password>` with your credentials

### 4. Run the Application

**Development Mode** (runs frontend and backend separately):

```bash
# Terminal 1 - Start backend server
npm run dev:server

# Terminal 2 - Start frontend dev server
npm run dev
```

**Production Mode:**

```bash
# Build the frontend
npm run build

# Start the production server
npm start
```

The application will be available at:
- Frontend: `http://localhost:5173` (dev mode) or `http://localhost:3000` (production)
- Backend API: `http://localhost:3000/api`

## 📁 Project Structure

```
inventory.electrohack2.0/
├── components/           # React components
│   ├── admin/           # Admin-specific components
│   ├── participant/     # Participant-specific components
│   └── common/          # Shared components
├── context/             # React Context providers
├── pages/               # Page components
├── assets/              # Static assets (images, logos)
├── server.js            # Express backend server
├── App.tsx              # Main React app component
├── types.ts             # TypeScript type definitions
└── .env.example         # Example environment variables
```

## 🔐 Security Best Practices

**⚠️ IMPORTANT:** Never commit sensitive information to version control!

- ✅ All sensitive data is stored in `.env.local` (gitignored)
- ✅ `.env.example` provides a template without real credentials
- ✅ Passwords are auto-generated for teams (8-character alphanumeric)
- ✅ MongoDB connection strings are environment variables
- ✅ API keys are never hardcoded in source files

**Before making your repository public:**
1. ✅ Ensure `.env.local` is in `.gitignore`
2. ✅ Remove any hardcoded credentials from code
3. ✅ Check git history for accidentally committed secrets
4. ✅ Use environment variables for all sensitive data

## 🔑 API Endpoints

### Health Check
- `GET /api/health` - Check server and database status

### Teams
- `POST /api/teams/register` - Register a new team
- `POST /api/teams/login` - Team login
- `DELETE /api/teams/:id` - Delete a team (admin)

### Inventory
- `GET /api/inventory` - Get all components, teams, and requests
- `PUT /api/components` - Add or update a component (admin)

### Requests
- `POST /api/requests` - Submit a component request
- `PATCH /api/requests/:id` - Update request status (admin)
- `PATCH /api/requests/:id/reinstate` - Return components to inventory (admin)
- `DELETE /api/requests/:id` - Delete a request (admin)

## 🎨 UI Design

The application features a futuristic design inspired by the ELECTROHACK 2.0 branding:
- Dark purple/blue gradient backgrounds
- Circuit pattern overlays
- Neon cyan accents (#00f0ff)
- Smooth animations and transitions
- Glassmorphism effects

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🐛 Troubleshooting

### Database Connection Issues
- Verify your `MONGODB_URI` is correct
- Check MongoDB Atlas IP whitelist (allow `0.0.0.0/0` for testing)
- Ensure your database user has read/write permissions

### Port Already in Use
- Change the `PORT` in `.env.local` to a different value
- Kill the process using port 3000: `npx kill-port 3000`

### Build Errors
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear build cache: `rm -rf dist`

## 📧 Support

For issues and questions:
- Open an issue on [GitHub Issues](https://github.com/yourusername/inventory.electrohack2.0/issues)
- Contact the maintainers

## 🙏 Acknowledgments

- Built for ELECTROHACK 2.0 by IEEE CAS
- Inspired by modern hackathon management needs
- Community contributions and feedback

---

<div align="center">
Made with ❤️ for ELECTROHACK 2.0
</div>

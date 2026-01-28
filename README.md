# KTI Portal - Internship Workflow Management System

A comprehensive platform designed to streamline internship workflows, centralize knowledge, and track progress for interns, team leads, and administrators.

## 🚀 Features

### Phase 1 - Core Operations (Current)

- **Task Assignment Log**: Claim and manage tasks with status tracking (To Do → In Progress → Review → Done)
- **Centralized Repository**: Search and access SOPs, guides, and video tutorials
- **Credential Vault**: View-only access to required tools and login instructions
- **Enhanced Dashboard**: Real-time progress tracking with daily statistics
- **Audit Trail**: Comprehensive logging of all system actions
- **Issue Tracker**: Report and manage technical issues
- **Kanban Board**: Visual task management with drag-and-drop
- **Organized Tickets**: Browse tickets by year and month

### Phase 2 - Coming Soon

- Attendance & Schedule Calendar
- Time In/Time Out tracking
- Who's Online sidebar
- Daily report reminders
- Duty calendar

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd issue-tracker-v2/client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the `client` directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Set up database**
   - Open Supabase SQL Editor
   - Run `database_setup.sql` to create all required tables
   - Run `sample_data.sql` to insert initial data
   - See `KTI_PORTAL_SETUP_GUIDE.md` for detailed instructions

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Open http://localhost:5173 in your browser
   - Log in with your credentials

## 📚 Documentation

- **[Setup Guide](KTI_PORTAL_SETUP_GUIDE.md)**: Complete setup and configuration instructions
- **[Testing Checklist](TESTING_CHECKLIST.md)**: Comprehensive testing guide
- **[Database Setup](database_setup.sql)**: SQL script for creating database tables
- **[Sample Data](sample_data.sql)**: SQL script for inserting initial data

## 🏗️ Project Structure

```
client/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── Navbar.jsx
│   │   ├── TicketDetailModal.jsx
│   │   └── CreateAccountModal.jsx
│   ├── pages/               # Page components
│   │   ├── AdminDashboard.jsx
│   │   ├── LeadDashboard.jsx
│   │   ├── InternDashboard.jsx
│   │   ├── TaskAssignmentLog.jsx
│   │   ├── CentralizedRepository.jsx
│   │   ├── CredentialVault.jsx
│   │   ├── Kanban.jsx
│   │   └── OrganizedTickets.jsx
│   ├── context/             # React context providers
│   │   └── supabase.jsx
│   ├── utils/               # Utility functions
│   │   ├── imageCompression.js
│   │   └── auditTrail.js
│   └── App.jsx              # Main application component
├── database_setup.sql        # Database schema
├── sample_data.sql          # Sample data
└── KTI_PORTAL_SETUP_GUIDE.md
```

## 👥 User Roles

### Intern
- Claim and manage assigned tasks
- Access repository documents
- View credential vault
- Track personal progress
- Report issues

### Lead
- View all tasks and tickets
- Assign tickets to team members
- Access all modules
- Monitor team progress

### Admin
- Full system access
- Create user accounts
- Manage all content
- Delete completed tickets
- View audit trail

## 🔐 Security

- Row Level Security (RLS) enabled on all tables
- Role-based access control
- Secure authentication via Supabase Auth
- Audit trail for all actions
- No password storage in credential vault

## 🧪 Testing

Run the testing checklist to verify all features:

1. Review `TESTING_CHECKLIST.md`
2. Follow each test case systematically
3. Document any issues found
4. Verify fixes before production deployment

## 🚢 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

The application can be deployed to any platform that supports Node.js:
- Netlify
- AWS Amplify
- Heroku
- DigitalOcean App Platform

## 📝 Database Schema

### Required Tables

- `tasks` - Task assignment and tracking
- `repository_documents` - Centralized knowledge base
- `credential_vault` - Tool access information
- `audit_trail` - System action logging
- `tickets` - Issue tracking (existing)
- `users` - User management (existing)

See `database_setup.sql` for complete schema.

## 🐛 Troubleshooting

### Common Issues

**Issue: Cannot claim tasks**
- Verify user role is set to 'intern' in user metadata
- Check Row Level Security policies
- Ensure task is not already assigned

**Issue: Progress bar not updating**
- Refresh the dashboard after status changes
- Verify tasks are being fetched correctly
- Check browser console for errors

**Issue: Search not working**
- Verify database indexes are created
- Check if documents have proper tags
- Ensure search query is not empty

See `KTI_PORTAL_SETUP_GUIDE.md` for detailed troubleshooting.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

[Your License Here]

## 👨‍💻 Development Team

- **Project**: KTI Portal
- **Version**: 1.0.0
- **Status**: Phase 1 Complete

## 🔄 Version History

- **v1.0.0** (January 2026)
  - Phase 1 implementation complete
  - Task Assignment Log
  - Centralized Repository
  - Credential Vault
  - Enhanced Dashboard
  - Audit Trail System

## 📞 Support

For issues or questions:
1. Check the documentation first
2. Review troubleshooting guide
3. Contact system administrator

---

**Built with ❤️ for efficient internship management**

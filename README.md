# CoderComm Server

Mock API server for the CoderComm social media application.

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation

1. Install dependencies
```bash
npm install
```

2. Start the server
```bash
npm start
```

The server will run on `http://localhost:3001` by default.

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration

### Users
- `GET /users/me` - Get current user profile
- `GET /users/:id` - Get user by ID
- `PUT /users/me` - Update current user profile

### Posts
- `GET /posts` - Get all posts
- `POST /posts` - Create a new post
- `GET /posts/:id` - Get post by ID
- `PUT /posts/:id` - Update post
- `DELETE /posts/:id` - Delete post

### Comments
- `GET /posts/:id/comments` - Get comments for a post
- `POST /posts/:id/comments` - Create a comment
- `PUT /comments/:id` - Update comment
- `DELETE /comments/:id` - Delete comment

### Reactions
- `POST /reactions` - Add reaction to post
- `DELETE /reactions/:id` - Remove reaction

## Configuration

The server uses environment variables for configuration:
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - JWT secret for authentication

## Development

To run in development mode:
```bash
npm run dev
```
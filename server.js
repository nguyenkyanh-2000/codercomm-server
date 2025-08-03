// server.js
import { delay, http } from "msw";
import { SignJWT } from "jose";
import {
  MOCK_ACCESS_TOKEN_EXPIRATION,
  MOCK_ACCESS_TOKEN_SECRET,
} from "./config.js";
import { v4 as uuidv4 } from "uuid";
import {
  ApiError,
  extractJWT,
  generateApiResponse,
  queryParams,
} from "./utils.js";
import { withAuth, catchError } from "./middleware.js";
import { loginSchema, registerSchema } from "./schema/auth.schema.js";
import { updateUserSchema } from "./schema/user.schema.js";
import {
  cursorPaginationSchema,
  offsetPaginationSchema,
} from "./schema/pagination.schema.js";
import { addSeconds } from "date-fns";
// import db from "./data.json" with { type: "json" };
import { createServer } from "@mswjs/http-middleware";
import fs from "fs";
import process from "process";

/**
 * Configures and starts the MSW API server.
 * It defines API endpoints (like /api/auth/login, /api/posts, etc.)
 * and determines what data to return when the frontend requests it.
 * Feel free to uncomment console.log statements to see the inner workings of the server.
 */

let db = {};

// Initialize database with data.json
const initializeDatabase = () => {
  const storedData = fs.readFileSync("data.json", "utf8");
  db = JSON.parse(storedData);

  db.users = db.users || [];
  db.posts = db.posts || [];
  db.comments = db.comments || [];
  db.reactions = db.reactions || [];
  db.friendships = db.friendships || [];

  console.log("📊 Data loaded from storage");
};

// Save current data to data.json
const saveToStorage = () => {
  try {
    fs.writeFileSync("data.json", JSON.stringify(db));
  } catch (error) {
    console.error("❌ Error saving data to storage:", error);
  }
};

// Helper to find user object by ID
const findUser = (userId) => db.users.find((u) => u._id === userId);

// Helper function to populate sender/receiver objects in a friendship/request
const populateFriendshipUsers = (friendship) => {
  if (!friendship) return null;
  const sender = findUser(friendship.from);
  const receiver = findUser(friendship.to);
  // Return a new object with sender/receiver fields, keeping original props
  return {
    ...friendship,
    sender: sender
      ? { _id: sender._id, name: sender.name, avatarUrl: sender.avatarUrl }
      : null,
    receiver: receiver
      ? {
          _id: receiver._id,
          name: receiver.name,
          avatarUrl: receiver.avatarUrl,
        }
      : null,
  };
};

// Define all API controllers
const controllers = [
  // --- Global delay to HTTP response ---
  http.all("*", async () => {
    await delay(250); // 250ms
  }),

  http.options("*", () => {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }),

  // --- Health check ---
  http.get(
    "/api/health",
    catchError(() => {
      return generateApiResponse({
        success: true,
        message: "I am healthy!",
        status: 200,
      });
    })
  ),

  // --- Authentication Routes ---
  http.post(
    "/api/auth/login",
    catchError(async ({ request }) => {
      const json = await request.json();
      const { email, password } = await loginSchema.validate(json);

      // console.log(`🔑 Login Attempt: ${email} with password: ${password}`);

      const user = db.users.find((u) => u.email === email);

      if (!user || user.password !== password)
        throw new ApiError(401, "Invalid credentials");

      // console.log(`🔑 Login Success: ${email}`);

      const { password: _password, ...userWithoutPassword } = user;

      const now = new Date();

      const accessToken = await new SignJWT({ _id: user._id })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now)
        .setExpirationTime(addSeconds(now, MOCK_ACCESS_TOKEN_EXPIRATION))
        .sign(MOCK_ACCESS_TOKEN_SECRET);

      return generateApiResponse({
        success: true,
        data: {
          user: userWithoutPassword,
        },
        accessToken,
        message: "Login successfully",
        status: 200,
      });
    })
  ),

  http.post(
    "/api/auth/logout",
    catchError(async () => {
      return generateApiResponse({
        success: true,
        message: "Logout successfully",
        status: 200,
        removeAccessToken: true,
      });
    })
  ),

  http.post(
    "/api/auth/register",
    catchError(async ({ request }) => {
      const json = await request.json();
      const { email, password, name } = await registerSchema.validate(json);

      const user = db.users.find((u) => u.email === email);

      if (user) throw new ApiError(400, "Cannot register with this email");

      const now = new Date();

      const newUser = {
        _id: uuidv4(),
        email,
        password,
        name,
        createdAt: now,
      };

      db.users.push(newUser);

      saveToStorage();

      const { password: _password, ...userWithoutPassword } = newUser;

      const accessToken = await new SignJWT({ _id: newUser._id })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now)
        .setExpirationTime(addSeconds(now, MOCK_ACCESS_TOKEN_EXPIRATION))
        .sign(MOCK_ACCESS_TOKEN_SECRET);

      return generateApiResponse({
        success: true,
        data: { user: userWithoutPassword },
        accessToken,
        message: "Register successfully",
        status: 200,
      });
    })
  ),

  // --- Current User Routes ---
  http.get(
    "/api/users/me",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const { password, ...user } = findUser(currentUserId);

        return generateApiResponse({
          success: true,
          data: { user },
          message: "Current user fetched successfully",
          status: 200,
        });
      })
    )
  ),

  http.put(
    "/api/users/me",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const json = await request.json();

        const updateUserInput = await updateUserSchema.validate(json);

        const currentUserIndex = db.users.findIndex(
          (u) => u._id === currentUserId
        );

        if (currentUserIndex === -1) {
          throw new ApiError(404, "User not found");
        }

        const currentUser = db.users[currentUserIndex];

        const { password, ...updatedUser } = {
          ...currentUser,
          ...updateUserInput,
        };

        db.users[currentUserIndex] = {
          ...currentUser,
          ...updateUserInput,
        };

        saveToStorage();

        return generateApiResponse({
          success: true,
          data: { user: updatedUser },
          message: "Update profile successfully",
          status: 200,
        });
      })
    )
  ),

  // --- User Routes ---

  http.get(
    "/api/users",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const query = queryParams(request);
        const { page = 0, limit = 10 } = await offsetPaginationSchema.validate(
          query
        );

        const startIndex = page * limit;
        const endIndex = startIndex + limit;

        const users = db.users
          .filter((u) => u._id !== currentUserId)
          .slice(startIndex, endIndex);

        const count = db.users.length - 1;
        const totalPages = Math.ceil(count / limit);

        return generateApiResponse({
          success: true,
          data: { users, totalPages, count, page, limit },
          message: "Users fetched successfully",
          status: 200,
        });
      })
    )
  ),

  http.get(
    "/api/users/:userId",
    catchError(
      withAuth(async ({ params, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { userId } = params;
        const user = findUser(userId);

        if (!user) throw new ApiError(404, "User not found");

        const postCount = db.posts.reduce((count, post) => {
          if (post.author === userId) {
            count++;
          }
          return count;
        }, 0);

        const { password, ...userWithoutPassword } = user;
        const userData = { ...userWithoutPassword, postCount };

        return generateApiResponse({
          success: true,
          data: { user: userData },
          message: "User fetched successfully",
          status: 200,
        });
      })
    )
  ),

  http.put(
    "/api/users/:userId",
    catchError(
      withAuth(async ({ request, params, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { userId } = params;
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        if (currentUserId !== userId) {
          throw new ApiError(403, "You are not authorized to update this user");
        }

        const userIndex = db.users.findIndex((u) => u._id === currentUserId);

        if (userIndex === -1) {
          return generateApiResponse({
            success: false,
            errors: ["User not found"],
            message: "User not found",
            status: 404,
          });
        }

        const json = await request.json();

        const updateUserInput = await updateUserSchema.validate(json);

        // Remove password from user object
        const { password, ...user } = (db.users[userIndex] = {
          ...db.users[userIndex],
          ...updateUserInput,
        });

        saveToStorage();

        return generateApiResponse({
          success: true,
          data: { user },
          message: "Update profile successfully",
          status: 200,
        });
      })
    )
  ),

  // --- Post Routes ---

  http.get(
    "/api/posts",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const query = queryParams(request);
        const { cursor, limit = 5 } = await cursorPaginationSchema.validate(
          query
        );

        const friendPosts = db.posts.filter((p) =>
          db.friendships.some(
            (f) =>
              (f.from === currentUserId && f.to === p.author) ||
              (f.to === currentUserId && f.from === p.author)
          )
        );

        const currentUserPosts = db.posts.filter(
          (p) => p.author === currentUserId
        );

        const feedPosts = [...friendPosts, ...currentUserPosts];

        feedPosts.sort((a, b) => {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        const count = feedPosts.length;

        // Find the index of the cursor post if provided
        let startIndex = 0;
        if (cursor) {
          const cursorIndex = feedPosts.findIndex((p) => p._id === cursor);
          if (cursorIndex !== -1) {
            startIndex = cursorIndex + 1;
          }
        }

        const endIndex = startIndex + limit;

        // Get posts after the cursor
        const postsAfterCursor = feedPosts.slice(startIndex, endIndex);

        const hasMore = count - endIndex > 0;

        // Add counts/reactions
        const postsWithDetails = postsAfterCursor.map((post) => {
          const author = db.users.find((u) => u._id === post.author);

          const postWithAuthor = {
            ...post,
            author: {
              _id: author._id,
              name: author.name,
              avatarUrl: author.avatarUrl,
            },
          };

          const reactions = db.reactions.filter(
            (r) => r.targetType === "POST" && r.targetId === post._id
          );

          const reactionsWithAuthor = reactions.map((r) => {
            const author = db.users.find((u) => u._id === r.author);
            return {
              ...r,
              author: {
                _id: author._id,
                name: author.name,
                avatarUrl: author.avatarUrl,
              },
            };
          });

          return {
            ...postWithAuthor,
            commentCount: db.comments.filter((c) => c.post === post._id).length,
            reactions: reactionsWithAuthor,
          };
        });

        return generateApiResponse({
          success: true,
          data: {
            posts: postsWithDetails,
            nextCursor: hasMore
              ? postsWithDetails[postsWithDetails.length - 1]._id
              : null,
            hasMore,
          },
          message: "Posts fetched successfully",
          status: 200,
        });
      })
    )
  ),

  http.get(
    "/api/posts/user/:userId",
    catchError(
      withAuth(async ({ request, params }) => {
        const { userId } = params;
        const query = queryParams(request);
        const { cursor, limit = 5 } = await cursorPaginationSchema.validate(
          query
        );

        const userExists = db.users.findIndex((u) => u._id === userId) > -1;

        if (!userExists) {
          return generateApiResponse({
            success: false,
            errors: ["User not found"],
            message: "User not found",
            status: 404,
          });
        }

        let userPosts = db.posts.filter((p) => p.author === userId);
        userPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Recent first

        const count = userPosts.length;

        // Find the index of the cursor post if provided
        let startIndex = 0;
        if (cursor) {
          const cursorIndex = userPosts.findIndex((p) => p._id === cursor);
          if (cursorIndex !== -1) {
            startIndex = cursorIndex + 1;
          }
        }

        const endIndex = startIndex + limit;

        // Get posts after the cursor
        const postsAfterCursor = userPosts.slice(startIndex, endIndex);

        const hasMore = count - endIndex > 0;

        // Add counts/reactions
        const postsWithDetails = postsAfterCursor.map((post) => {
          const author = db.users.find((u) => u._id === post.author);

          const postWithAuthor = {
            ...post,
            author: {
              _id: author._id,
              name: author.name,
              avatarUrl: author.avatarUrl,
            },
          };

          const reactions = db.reactions.filter(
            (r) => r.targetType === "POST" && r.targetId === post._id
          );

          const reactionsWithAuthor = reactions.map((r) => {
            const author = db.users.find((u) => u._id === r.author);
            return {
              ...r,
              author: {
                _id: author._id,
                name: author.name,
                avatarUrl: author.avatarUrl,
              },
            };
          });

          return {
            ...postWithAuthor,
            commentCount: db.comments.filter((c) => c.post === post._id).length,
            reactions: reactionsWithAuthor,
          };
        });

        return generateApiResponse({
          success: true,
          data: {
            posts: postsWithDetails,
            nextCursor: hasMore
              ? postsWithDetails[postsWithDetails.length - 1]._id
              : null,
            hasMore,
          },
          message: "Posts fetched for user successfully",
          status: 200,
        });
      })
    )
  ),

  http.post(
    "/api/posts",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { content, image } = await request.json();
        const payload = await extractJWT(accessToken);
        const currentUser = findUser(payload._id);

        if (!currentUser) {
          return generateApiResponse({
            success: false,
            errors: ["User not found"],
            message: "User not found",
            status: 401,
          });
        }

        if (!content || content.trim().length === 0) {
          return generateApiResponse({
            success: false,
            errors: ["Post content cannot be empty"],
            message: "Post content cannot be empty",
            status: 400,
          });
        }

        const newPost = {
          _id: uuidv4(),
          content: content.trim(),
          image: image || null,
          author: currentUser._id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          reactions: [],
          commentCount: 0,
        };

        db.posts.unshift(newPost);
        saveToStorage();

        return generateApiResponse({
          success: true,
          data: {
            post: {
              ...newPost,
              author: {
                _id: currentUser._id,
                name: currentUser.name,
                avatarUrl: currentUser.avatarUrl,
              },
            },
          },
          message: "Post created successfully",
          status: 200,
        });
      })
    )
  ),

  // --- Comment Routes ---
  http.get(
    "/api/posts/:postId/comments",
    catchError(
      withAuth(async ({ params, request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const postId = params.postId;
        const query = queryParams(request);
        const { cursor, limit = 5 } = await cursorPaginationSchema.validate(
          query
        );

        let postComments = db.comments.filter((c) => c.post === postId);

        const count = postComments.length;

        postComments.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        ); // Recent first

        // Find the index of the cursor comment if provided
        let startIndex = 0;
        if (cursor) {
          const cursorIndex = postComments.findIndex((c) => c._id === cursor);
          if (cursorIndex !== -1) {
            startIndex = cursorIndex + 1;
          }
        }

        const endIndex = startIndex + limit;

        // Get comments after the cursor
        const commentsAfterCursor = postComments.slice(startIndex, endIndex);

        const hasMore = count - endIndex > 0;

        // Add reactions
        const commentsWithDetails = commentsAfterCursor.map((comment) => {
          const author = db.users.find((u) => u._id === comment.author);
          const reactions = db.reactions.filter(
            (r) => r.targetType === "COMMENT" && r.targetId === comment._id
          );

          const reactionsWithAuthor = reactions.map((r) => {
            const author = db.users.find((u) => u._id === r.author);
            return {
              ...r,
              author: {
                _id: author._id,
                name: author.name,
                avatarUrl: author.avatarUrl,
              },
            };
          });

          return {
            ...comment,
            author: {
              _id: author._id,
              name: author.name,
              avatarUrl: author.avatarUrl,
            },
            reactions: reactionsWithAuthor,
          };
        });

        return generateApiResponse({
          success: true,
          data: {
            comments: commentsWithDetails,
            nextCursor: hasMore
              ? commentsWithDetails[commentsWithDetails.length - 1]._id
              : null,
            hasMore,
          },
          status: 200,
        });
      })
    )
  ),

  http.post(
    "/api/posts/:postId/comments",
    catchError(
      withAuth(async ({ request, params, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const postId = params.postId;
        const { content } = await request.json();
        const payload = await extractJWT(accessToken);
        const currentUser = findUser(payload._id);

        if (!content) {
          return generateApiResponse({
            success: false,
            errors: ["Comment content cannot be empty"],
            message: "Comment content cannot be empty",
            status: 400,
          });
        }

        const postExists = db.posts.some((p) => p._id === postId);
        if (!postExists) {
          return generateApiResponse({
            success: false,
            errors: ["Post not found"],
            message: "Post not found",
            status: 404,
          });
        }

        const newComment = {
          _id: uuidv4(),
          content,
          post: postId,
          author: currentUser._id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          reactions: [],
        };

        db.comments.push(newComment);
        saveToStorage();

        return generateApiResponse({
          success: true,
          data: {
            comment: {
              ...newComment,
              author: {
                _id: currentUser._id,
                name: currentUser.name,
                avatarUrl: currentUser.avatarUrl,
              },
            },
          },
          message: "Comment added successfully",
          status: 200,
        });
      })
    )
  ),

  // --- Reaction Routes ---
  http.post(
    "/api/reactions",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { targetType, targetId, emoji } = await request.json();
        const payload = await extractJWT(accessToken);
        const currentUser = findUser(payload._id);

        if (!["POST", "COMMENT"].includes(targetType) || !targetId || !emoji) {
          return generateApiResponse({
            success: false,
            errors: ["Invalid reaction request"],
            message: "Invalid reaction request",
            status: 400,
          });
        }

        // Find existing reaction by this user for this target
        const existingReactionIndex = db.reactions.findIndex(
          (r) =>
            r.targetType === targetType &&
            r.targetId === targetId &&
            r.author === currentUser._id
        );

        // Upsert reaction
        let updatedReaction;

        if (existingReactionIndex > -1) {
          const existingReaction = db.reactions[existingReactionIndex];

          if (existingReaction.emoji === emoji) {
            // User is removing their reaction (e.g., unliking)
            db.reactions.splice(existingReactionIndex, 1);
            updatedReaction = { ...existingReaction, emoji: null };
          } else {
            // User is changing their reaction (e.g., liking a different emoji)
            db.reactions[existingReactionIndex].emoji = emoji;
            updatedReaction = { ...existingReaction, emoji };
          }
        } else {
          // Add new reaction
          updatedReaction = {
            _id: uuidv4(),
            targetType,
            targetId,
            emoji,
            author: currentUser._id,
            createdAt: new Date().toISOString(),
          };
          db.reactions.push(updatedReaction);
        }

        saveToStorage();

        return generateApiResponse({
          success: true,
          data: {
            reaction: {
              ...updatedReaction,
              author: {
                _id: currentUser._id,
                name: currentUser.name,
                avatarUrl: currentUser.avatarUrl,
              },
            },
          },
          status: 200,
        });
      })
    )
  ),

  // --- Friendship Routes (User's perspective) ---
  http.get(
    "/api/friends",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const url = new URL(request.url);
        const name = url.searchParams.get("name") || "";

        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const friendIds = db.friendships
          .filter(
            (f) =>
              f.status === "ACCEPTED" &&
              (f.from === currentUserId || f.to === currentUserId)
          )
          .map((f) => (f.from === currentUserId ? f.to : f.from));

        let friendUsers = db.users.filter((u) => friendIds.includes(u._id));

        if (name) {
          friendUsers = friendUsers.filter((u) =>
            u.name.toLowerCase().includes(name.toLowerCase())
          );
        }

        return generateApiResponse({
          success: true,
          data: {
            users: friendUsers,
            totalPages: 1,
            count: friendUsers.length,
          },
          status: 200,
        });
      })
    )
  ),

  http.get(
    "/api/friends/requests",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        // Incoming Requests Logic
        let incomingRaw = db.friendships.filter(
          (fs) => fs.to === currentUserId && fs.status === "PENDING"
        );
        // Use helper to populate sender/receiver
        const incomingRequests = incomingRaw.map(populateFriendshipUsers);

        // Outgoing Requests Logic
        let outgoingRaw = db.friendships.filter(
          (fs) => fs.from === currentUserId && fs.status === "PENDING"
        );
        // Use helper to populate sender/receiver
        const outgoingRequests = outgoingRaw.map(populateFriendshipUsers);

        return generateApiResponse({
          success: true,
          data: { incoming: incomingRequests, outgoing: outgoingRequests },
          status: 200,
        });
      })
    )
  ),

  http.get(
    "/api/friends/requests/incoming",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const url = new URL(request.url);
        const name = url.searchParams.get("name") || "";

        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        let incomingRequests = db.friendships.filter(
          (fs) => fs.to === currentUserId && fs.status === "PENDING"
        );

        // Populate requester info
        incomingRequests = incomingRequests.map((req) => ({
          ...req,
          requester: db.users.find((u) => u._id === req.from),
        }));

        if (name) {
          incomingRequests = incomingRequests.filter((req) =>
            req.requester?.name.toLowerCase().includes(name.toLowerCase())
          );
        }

        return generateApiResponse({
          success: true,
          data: {
            requests: incomingRequests,
            totalPages: 1,
            count: incomingRequests.length,
          },
          status: 200,
        });
      })
    )
  ),

  http.get(
    "/api/friends/requests/outgoing",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const url = new URL(request.url);
        const name = url.searchParams.get("name") || "";
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        let outgoingRequests = db.friendships.filter(
          (fs) => fs.from === currentUserId && fs.status === "PENDING"
        );

        // Populate recipient info
        outgoingRequests = outgoingRequests.map((req) => ({
          ...req,
          recipient: db.users.find((u) => u._id === req.to),
        }));

        if (name) {
          outgoingRequests = outgoingRequests.filter((req) =>
            req.recipient?.name.toLowerCase().includes(name.toLowerCase())
          );
        }

        return generateApiResponse({
          success: true,
          data: {
            requests: outgoingRequests,
            totalPages: 1,
            count: outgoingRequests.length,
          },
          status: 200,
        });
      })
    )
  ),

  // --- Friendship Action Routes ---
  http.post(
    "/api/friends/requests",
    catchError(
      withAuth(async ({ request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { to: targetUserId } = await request.json();

        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        if (targetUserId === currentUserId) {
          // Cannot friend yourself
          return generateApiResponse({
            success: false,
            errors: ["You cannot send a friend request to yourself."],
            message: "You cannot send a friend request to yourself.",
            status: 400,
          });
        }

        const existing = db.friendships.find(
          (fs) =>
            (fs.from === currentUserId && fs.to === targetUserId) ||
            (fs.to === currentUserId && fs.from === targetUserId)
        );

        if (!existing) {
          const newFriendshipRaw = {
            _id: uuidv4(),
            from: currentUserId,
            to: targetUserId,
            status: "PENDING",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          db.friendships.push(newFriendshipRaw);
          saveToStorage();
          // Return the populated new friendship object
          return generateApiResponse({
            success: true,
            data: { friendship: populateFriendshipUsers(newFriendshipRaw) },
            message: "Friend request sent successfully",
            status: 200,
          });
        }

        if (existing.status === "PENDING") {
          return generateApiResponse({
            success: false,
            errors: ["Friend request already pending."],
            message: "Friend request already pending.",
            status: 400,
          });
        }

        if (existing.status === "ACCEPTED") {
          return generateApiResponse({
            success: false,
            errors: ["You are already friends with this user."],
            message: "You are already friends with this user.",
            status: 400,
          });
        }

        return generateApiResponse({
          success: false,
          errors: ["Cannot send friend request."],
          message: "Cannot send friend request.",
          status: 400,
        });
      })
    )
  ),

  http.put(
    "/api/friends/requests/:requesterId",
    catchError(
      withAuth(async ({ params, request, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { requesterId } = params;
        const url = new URL(request.url);
        const action = url.searchParams.get("action"); // 'accept' or 'decline'
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const requestIndex = db.friendships.findIndex(
          (fs) =>
            fs.from === requesterId &&
            fs.to === currentUserId &&
            fs.status === "PENDING"
        );

        if (requestIndex === -1) {
          return generateApiResponse({
            success: false,
            errors: ["Incoming friend request not found or already handled."],
            message: "Incoming friend request not found or already handled.",
            status: 404,
          });
        }

        if (action === "ACCEPT") {
          db.friendships[requestIndex].status = "ACCEPTED";
          db.friendships[requestIndex].updatedAt = new Date().toISOString();
          saveToStorage();
          // Return the updated friendship record, populated
          return generateApiResponse({
            success: true,
            data: {
              friendship: populateFriendshipUsers(db.friendships[requestIndex]),
            },
            message: "Friend request accepted",
            status: 200,
          });
        }

        if (action === "DECLINE") {
          const declinedRequest = db.friendships.splice(requestIndex, 1)[0];
          saveToStorage();
          // Return the ID of the declined/removed friendship
          return generateApiResponse({
            success: true,
            data: { declinedFriendshipId: declinedRequest._id },
            message: "Friend request declined",
            status: 200,
          });
        }

        return generateApiResponse({
          success: false,
          errors: ["Invalid action."],
          message: "Invalid action.",
          status: 400,
        });
      })
    )
  ),

  http.delete(
    "/api/friends/requests/:recipientId",
    catchError(
      withAuth(async ({ params, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { recipientId } = params;
        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const requestIndex = db.friendships.findIndex(
          (fs) =>
            fs.from === currentUserId &&
            fs.to === recipientId &&
            fs.status === "PENDING"
        );

        if (requestIndex === -1) {
          return generateApiResponse({
            success: false,
            errors: ["Outgoing friend request not found."],
            message: "Outgoing friend request not found.",
            status: 404,
          });
        }

        db.friendships.splice(requestIndex, 1); // Remove the pending request
        saveToStorage();

        return generateApiResponse({
          success: true,
          message: "Friend request cancelled",
          status: 204,
        });
      })
    )
  ),

  http.delete(
    "/api/friends/:friendId",
    catchError(
      withAuth(async ({ params, cookies }) => {
        const accessToken = cookies["codercomm-access-token"];
        const { friendId } = params;

        const payload = await extractJWT(accessToken);
        const currentUserId = payload._id;

        const friendshipIndex = db.friendships.findIndex(
          (fs) =>
            ((fs.from === currentUserId && fs.to === friendId) ||
              (fs.to === currentUserId && fs.from === friendId)) &&
            fs.status === "ACCEPTED"
        );

        if (friendshipIndex === -1) {
          return generateApiResponse({
            success: false,
            errors: ["Friendship not found."],
            message: "Friendship not found.",
            status: 404,
          });
        }

        db.friendships.splice(friendshipIndex, 1); // Remove the friendship
        saveToStorage();

        return generateApiResponse({
          success: true,
          message: "Friend removed successfully",
          status: 204,
        });
      })
    )
  ),
];

const httpServer = createServer(...controllers);
initializeDatabase();
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT);
console.log(`Server is running on port ${PORT}`);

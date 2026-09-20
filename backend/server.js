require("dotenv").config();

const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");

const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5000;

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set in .env. Exiting.");
  process.exit(1);
}

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
  },
});

const pool = require("./db");

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Express");
});

// ---------- Auth: register ----------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, hashedPassword, role || "CUSTOMER"]
    );

    res.status(201).json({
      message: "User registered successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    // Postgres unique_violation (duplicate email)
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    res.status(500).json({
      message: "Registration failed",
    });
  }
});

// ---------- Auth: login ----------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.json({
      message: "Login successful",
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login failed",
    });
  }
});

// ---------- Middleware ----------
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Access denied",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};

// ---------- Services ----------
app.get("/api/services", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM services");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch services",
    });
  }
});

// ---------- Tokens ----------
app.post("/api/tokens", async (req, res) => {
  const client = await pool.connect();
  try {
    const { serviceId } = req.body;

    if (!serviceId) {
      return res.status(400).json({ message: "serviceId is required" });
    }

    // Wrap read + insert in a transaction and serialize concurrent
    // requests for the same service with an advisory lock, so two
    // simultaneous requests can't generate the same token_number.
    // (Postgres doesn't allow FOR UPDATE directly on an aggregate
    // query like MAX(), so we lock by serviceId instead.)
    await client.query("BEGIN");

    await client.query("SELECT pg_advisory_xact_lock($1)", [serviceId]);

    const result = await client.query(
      `SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token
       FROM tokens
       WHERE service_id = $1`,
      [serviceId]
    );

    const nextToken = result.rows[0].next_token;

    const tokenResult = await client.query(
      `INSERT INTO tokens (token_number, service_id)
       VALUES ($1, $2)
       RETURNING id`,
      [nextToken, serviceId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Token created",
      tokenNumber: nextToken,
      tokenId: tokenResult.rows[0].id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      message: "Failed to create token",
    });
  } finally {
    client.release();
  }
});

app.get("/api/queue/:serviceId", verifyToken, async (req, res) => {
  try {
    const { serviceId } = req.params;

    const result = await pool.query(
      `SELECT *
       FROM tokens
       WHERE service_id = $1
       AND status = 'WAITING'
       ORDER BY token_number ASC`,
      [serviceId]
    );

    res.json({
      waitingCount: result.rows.length,
      queue: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch queue",
    });
  }
});

app.post(
  "/api/tokens/next/:serviceId",
  verifyToken,
  checkRole("ADMIN"),
  async (req, res) => {
    try {
      const { serviceId } = req.params;

      const result = await pool.query(
        `SELECT id, token_number
         FROM tokens
         WHERE service_id = $1
         AND status = 'WAITING'
         ORDER BY token_number ASC
         LIMIT 1`,
        [serviceId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No waiting tokens",
        });
      }

      const token = result.rows[0];

      await pool.query(
        `UPDATE tokens
         SET status = 'CALLED'
         WHERE id = $1`,
        [token.id]
      );

      io.emit("token-called", {
        tokenId: token.id,
        tokenNumber: token.token_number,
        serviceId: Number(serviceId),
      });

      res.json({
        message: "Next token called",
        tokenNumber: token.token_number,
        tokenId: token.id,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to call next token",
      });
    }
  }
);

app.post(
  "/api/tokens/:id/complete",
  verifyToken,
  checkRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE tokens
         SET status = 'COMPLETED'
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Token not found",
        });
      }

      io.emit("token-completed", {
        tokenId: result.rows[0].id,
      });

      res.json({
        message: "Token completed",
        token: result.rows[0],
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to complete token",
      });
    }
  }
);

app.post(
  "/api/tokens/:id/skip",
  verifyToken,
  checkRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE tokens
         SET status = 'SKIPPED'
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Token not found",
        });
      }
      io.emit("token-skipped", {
        tokenId: result.rows[0].id,
      });
      res.json({
        message: "Token skipped",
        token: result.rows[0],
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to skip token",
      });
    }
  }
);

// Admin: promote an existing user to ADMIN by email
app.post(
  "/api/users/promote",
  verifyToken,
  checkRole("ADMIN"),
  async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "email is required" });
      }

      const result = await pool.query(
        `UPDATE users
         SET role = 'ADMIN'
         WHERE email = $1
         RETURNING id, name, email, role`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No user found with that email" });
      }

      res.json({
        message: "User promoted to ADMIN",
        user: result.rows[0],
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to promote user" });
    }
  }
);

app.get("/api/tokens/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`SELECT * FROM tokens WHERE id = $1`, [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Token not found",
      });
    }

    const token = result.rows[0];

    const aheadResult = await pool.query(
      `SELECT COUNT(*) 
       FROM tokens
       WHERE service_id = $1
       AND status = 'WAITING'
       AND token_number < $2`,
      [token.service_id, token.token_number]
    );

    res.json({
      token: token,
      peopleAhead: Number(aheadResult.rows[0].count),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch token",
    });
  }
});

pool
  .query("SELECT NOW()")
  .then(() => {
    console.log("PostgreSQL connected successfully");
  })
  .catch((error) => {
    console.error("PostgreSQL connection failed:", error.message);
  });

// NOTE: socket.on("token-called", ...) with setTrackingData was removed here.
// That was frontend/React code that had accidentally been pasted into the
// server file. The server only needs to emit events (io.emit(...)) above;
// listening for "token-called" and updating UI state belongs in the
// frontend socket.io client code.
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

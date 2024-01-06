const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect("mongodb://127.0.0.1:27017/chatapp", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  name: String,
  status: String,
});

const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  sender: String,
  recipient: String,
  text: String,
  time: String,
});

const Message = mongoose.model("Message", messageSchema);

app.get("/", (req, res) => {
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const newUser = new User({ email, password, name, status: "offline" });
    await newUser.save();
    res.redirect("/");
  } catch (error) {
    res.status(500).send("Error creating user");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (user) {
      // Update user status to online
      user.status = "online";
      await user.save();
      res.redirect(`/homepage/${user._id}`);
    } else {
      res.status(401).send("Invalid credentials");
    }
  } catch (error) {
    res.status(500).send("Error logging in");
  }
});

app.get("/homepage/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await User.findById(userId);
    if (user) {
      const users = await User.find({ _id: { $ne: userId } });
      res.render("homepage", { userId, userName: user.name, users });
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    res.status(500).send("Error fetching users");
  }
});

app.get("/personal-chat/:userId/:otherUserId", async (req, res) => {
  const userId = req.params.userId;
  const otherUserId = req.params.otherUserId;

  console.log(userId);
  console.log(otherUserId);

  try {
    const otherUser = await User.findById(otherUserId);
    if (otherUser) {
      const messages = await Message.find({
        $or: [
          { sender: userId, recipient: otherUserId },
          { sender: otherUserId, recipient: userId },
        ],
      });
      res.render("personalChat", { userId, otherUser, messages });
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    res.status(500).send("Error fetching user");
  }
});

app.post("/send-message/:userId/:otherUserId", async (req, res) => {
  const userId = req.params.userId;
  const otherUserId = req.params.otherUserId;
  const { message } = req.body;

  try {
    const timestamp = new Date().toLocaleTimeString();
    const newMessage = new Message({
      sender: userId,
      recipient: otherUserId,
      text: message,
      time: timestamp,
    });
    await newMessage.save();

    // Notify the recipient that a new message has been received
    const recipientUser = await User.findById(otherUserId);
    if (recipientUser && recipientUser.socketId) {
      io.to(recipientUser.socketId).emit("new message", {
        sender: userId,
        time: timestamp,
      });
    }

    // Redirect to the personal chat page after sending the message
    res.redirect(`/personal-chat/${userId}/${otherUserId}`);
  } catch (error) {
    res.status(500).send("Error sending message");
  }
});

app.get("/logout/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await User.findById(userId);
    if (user) {
      // Update user status to offline
      user.status = "offline";
      await user.save();
      res.redirect("/");
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    res.status(500).send("Error logging out");
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Socket.IO logic for real-time chat
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("disconnect", async () => {
    const user = await User.findOne({ socketId: socket.id });
    if (user) {
      user.status = "offline";
      await user.save();
      io.emit("user status", { userId: user._id, status: "offline" });
    }
    console.log("User disconnected");
  });

  socket.on("user joined", async (userId) => {
    const user = await User.findById(userId);
    if (user) {
      user.status = "online";
      user.socketId = socket.id;
      await user.save();
      io.emit("user status", { userId, status: "online" });
    }
  });

  socket.on("chat message", async (data) => {
    const { sender, recipient, text, time } = data;
    const newMessage = new Message({ sender, recipient, text, time });
    await newMessage.save();
    io.to(sender).to(recipient).emit("chat message", data);

    // Notify the recipient that a new message has been received
    const recipientUser = await User.findById(recipient);
    if (recipientUser && recipientUser.socketId) {
      io.to(recipientUser.socketId).emit("new message", { sender, time });
    }
  });
});

// ... (remaining code)

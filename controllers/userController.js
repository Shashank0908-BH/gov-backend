// backend/controllers/userController.js
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// @desc    Register a new user
export const registerUser = async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) return res.status(400).json({ message: 'Please provide username, password, and role' });
    if (!['Admin', 'Staff', 'Public'].includes(role)) return res.status(400).json({ message: 'Invalid role.' });

    try {
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) return res.status(400).json({ message: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, hashedPassword, role]
        );
        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// @desc    Authenticate a user (login)
export const loginUser = async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (user && (await bcrypt.compare(password, user.password_hash))) {
            const token = jwt.sign(
                { id: user.id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );
            res.json({
                id: user.id,
                username: user.username,
                role: user.role,
                token: token,
            });
        } else {
            res.status(401).json({ message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login' });
    }
};
// FILE: infinosbackend/routes/auth.js
// Enhanced authentication routes with email verification support

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * POST /api/auth/verify-email
 * Manually trigger email verification resend
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Resend verification email
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      console.error('❌ Failed to resend verification email:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    console.log('✅ Verification email resent to:', email);

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (err) {
    console.error('❌ Error in verify-email route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification email'
    });
  }
});

/**
 * POST /api/auth/check-email-verified
 * Check if user's email is verified
 */
router.post('/check-email-verified', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Get user from Supabase
    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (error) {
      console.error('❌ Failed to get user:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      emailVerified: !!data.user.email_confirmed_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        emailConfirmedAt: data.user.email_confirmed_at,
        createdAt: data.user.created_at
      }
    });
  } catch (err) {
    console.error('❌ Error in check-email-verified route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to check email verification status'
    });
  }
});

/**
 * POST /api/auth/send-password-reset
 * Trigger password reset email
 */
router.post('/send-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}`,
    });

    if (error) {
      console.error('❌ Failed to send password reset email:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    console.log('✅ Password reset email sent to:', email);

    res.json({
      success: true,
      message: 'Password reset email sent successfully'
    });
  } catch (err) {
    console.error('❌ Error in send-password-reset route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to send password reset email'
    });
  }
});

/**
 * GET /api/auth/users
 * Get all users (admin only)
 */
router.get('/users', async (req, res) => {
  try {
    // Verify admin passkey
    const adminPasskey = req.headers['x-admin-passkey'];
    if (adminPasskey !== process.env.ADMIN_PASSKEY) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Get all users
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('❌ Failed to get users:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Format user data
    const users = data.users.map(user => ({
      id: user.id,
      email: user.email,
      emailVerified: !!user.email_confirmed_at,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      name: user.user_metadata?.name || 'N/A'
    }));

    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (err) {
    console.error('❌ Error in users route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

/**
 * POST /api/auth/update-user
 * Update user details (admin only)
 */
router.post('/update-user', async (req, res) => {
  try {
    // Verify admin passkey
    const adminPasskey = req.headers['x-admin-passkey'];
    if (adminPasskey !== process.env.ADMIN_PASSKEY) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { userId, updates } = req.body;

    if (!userId || !updates) {
      return res.status(400).json({
        success: false,
        error: 'User ID and updates are required'
      });
    }

    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      updates
    );

    if (error) {
      console.error('❌ Failed to update user:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    console.log('✅ User updated:', userId);

    res.json({
      success: true,
      user: data.user
    });
  } catch (err) {
    console.error('❌ Error in update-user route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * DELETE /api/auth/delete-user
 * Delete user (admin only)
 */
router.delete('/delete-user/:userId', async (req, res) => {
  try {
    // Verify admin passkey
    const adminPasskey = req.headers['x-admin-passkey'];
    if (adminPasskey !== process.env.ADMIN_PASSKEY) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const { data, error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error('❌ Failed to delete user:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    console.log('✅ User deleted:', userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (err) {
    console.error('❌ Error in delete-user route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

module.exports = router;
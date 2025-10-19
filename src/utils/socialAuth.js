import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(token) {
  try {
    if (!token) {
      console.log("No Google token provided");
      return null;
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.log("Google Client ID not configured");
      return null;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      console.log("Invalid Google token payload");
      return null;
    }

    return {
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      picture:
        payload.picture ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${payload.email}`,
      googleId: payload.sub,
    };
  } catch (error) {
    console.log("Error verifying Google token:", error.message);
    return null;
  }
}

export async function verifyFacebookToken(token) {
  try {
    if (!token) {
      console.log("No Facebook token provided");
      return null;
    }

    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      console.log("Facebook App ID or Secret not configured");
      return null;
    }

    // First, verify the token is valid
    const debugResponse = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`
    );

    if (!debugResponse.ok) {
      console.log("Facebook token debug failed");
      return null;
    }

    const debugData = await debugResponse.json();

    if (!debugData.data || !debugData.data.is_valid) {
      console.log("Facebook token is invalid");
      return null;
    }

    // Then get user data
    const response = await fetch(
      `https://graph.facebook.com/${debugData.data.user_id}?fields=id,name,email,picture&access_token=${token}`
    );

    if (!response.ok) {
      console.log("Failed to fetch Facebook user data");
      return null;
    }

    const userData = await response.json();

    if (!userData.id || !userData.name) {
      console.log("Invalid Facebook user data");
      return null;
    }

    return {
      email: userData.email || `${userData.id}@facebook.temp`,
      name: userData.name,
      picture:
        userData.picture?.data?.url ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.name}`,
      facebookId: userData.id,
    };
  } catch (error) {
    console.log("Error verifying Facebook token:", error.message);
    return null;
  }
}

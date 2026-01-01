# Bubble Pop Royale - Multiplayer Edition

A hand-tracking bubble popping game with multiplayer support built with MediaPipe and Firebase.

## Features

- Hand gesture recognition using MediaPipe
- Solo and multiplayer game modes
- In-game shop with customizable bubble skins
- Real-time multiplayer synchronization
- Career statistics tracking

## Firebase Setup

Before deploying, you need to configure Firebase:

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" and follow the setup wizard

2. **Get Firebase Configuration**
   - In your Firebase project, click the Web icon (`</>`) to add a web app
   - Copy the `firebaseConfig` object

3. **Enable Required Services**
   - **Authentication**: Go to Authentication → Sign-in method → Enable "Anonymous"
   - **Firestore**: Go to Firestore Database → Create database (start in production mode)

4. **Update config.js**
   - Open `config.js` in your project
   - Replace the placeholder values with your actual Firebase config

## Local Development

1. Use a local web server (Firebase doesn't work with `file://` protocol):
   ```bash
   npx serve
   ```
   or
   ```bash
   python -m http.server 8000
   ```

2. Open your browser to the local server address

## Deployment

This project is configured for Vercel deployment. The site is deployed at your Vercel URL.

## File Structure

- `index.html` - Main HTML structure
- `styles.css` - All styling and animations
- `game.js` - Game logic and Firebase integration
- `config.js` - Firebase configuration

## Requirements

- Modern browser with webcam access
- Internet connection for Firebase services
- HTTPS required for camera access (provided by Vercel)

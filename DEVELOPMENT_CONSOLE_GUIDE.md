# Development Console - User Guide

## Overview

A real-time development console has been added to the bottom of the dashboard to help you monitor all API calls, user actions, and system events during development. This will significantly help in debugging and identifying issues quickly.

## Features

### 1. Real-Time Logging
The console automatically captures:
- **API Requests**: All HTTP requests to the backend
- **API Responses**: Success/error responses with status codes
- **User Actions**: Button clicks, form submissions, modal interactions
- **System Events**: LTP refresh, initialization, background tasks

### 2. Color-Coded Logs
Different types of logs are color-coded for easy identification:
- 🔵 **Blue** - API Requests
- 🟢 **Green** - API Success Responses
- 🔴 **Red** - API Errors
- 🟣 **Purple** - User Actions
- 🟡 **Yellow** - System Events

### 3. Interactive Controls

#### Toggle Console
- Click the **terminal icon** in the console header to expand/collapse
- The chevron icon rotates when expanded

#### Pause/Resume Logging
- Click the **Pause** button to temporarily stop logging
- Button changes to green with "Resume" text when paused
- Click again to resume logging

#### Clear Console
- Click the **Clear** button to remove all logs
- Keeps last 500 logs to prevent memory issues

#### Log Count
- Shows total number of logs in the header
- Automatically updates as new logs are added

### 4. Log Format

Each log entry includes:
- **Timestamp**: Millisecond-precision time (HH:MM:SS.mmm)
- **Type**: Log category (API REQUEST, API SUCCESS, USER ACTION, etc.)
- **Message**: Brief description of the event
- **Details**: JSON data or additional information (expandable)

Example:
```
13:45:23.567  API REQUEST:  POST http://localhost:3000/api/orders/123/cancel
{
  "instance_id": "1",
  "order_id": "123"
}
```

## Usage Instructions

### Accessing the Console
1. The console is collapsed by default at the bottom of the page
2. Click the **Development Console** header or terminal icon to expand
3. Logs will appear automatically as you interact with the application

### Monitoring API Calls
1. All fetch() requests are automatically intercepted and logged
2. You can see:
   - Request URL and method (GET, POST, PUT, DELETE)
   - Request body/payload
   - Response status and data
   - Any errors that occur

### Tracking User Actions
Common actions automatically logged:
- Opening/closing modals
- Placing orders (BUY, SELL, CE, PE, EXIT)
- Expanding/collapsing watchlists
- Editing symbol configurations
- Starting/stopping LTP refresh

### Monitoring System Events
- LTP refresh intervals (15-second cycles)
- WebSocket connections
- Market data updates
- Authentication checks
- Initialization events

## Benefits for Development

### 1. Debugging
- Instantly see which API endpoints are being called
- Identify failed requests and their error messages
- Track the flow of user interactions

### 2. Performance Monitoring
- See timing of API calls
- Monitor LTP refresh frequency
- Identify slow requests

### 3. Data Verification
- Inspect request payloads before sending
- Verify API responses
- Check system state changes

### 4. Issue Tracking
- Reproduce issues by watching user actions
- See exact sequence of events leading to errors
- Monitor real-time data updates

## Example Scenarios

### Scenario 1: Order Placement Debugging
1. Click a BUY/SELL/CE/PE button
2. Watch the console for:
   - Order initiation log
   - Options contract generation API call
   - Order placement API request
   - API response with order ID
   - Success confirmation

### Scenario 2: LTP Refresh Monitoring
1. Expand a watchlist
2. Console shows:
   - Watchlist expansion event
   - LTP refresh start
   - Market data fetch requests
   - Regular 15-second refresh cycles
3. Collapse watchlist
4. Console shows refresh stop event

### Scenario 3: Symbol Configuration
1. Click edit symbol icon
2. Console shows:
   - Opening edit modal
   - Form field population
   - Save configuration
   - API update request
   - Success response

### Scenario 4: Error Investigation
1. Perform an action that fails
2. Console immediately shows:
   - Red-colored API ERROR log
   - Error message and details
   - Failed request URL and method
   - Response status code

## Technical Details

### Implementation
- Automatic fetch() interception
- Minimal performance impact
- Runs only in development mode
- Logs stored in memory (not persisted)

### Log Limits
- Maximum 500 logs kept in memory
- Oldest logs automatically removed
- Prevents browser memory issues

### Console Controls
```javascript
// Toggle console visibility
toggleConsole()

// Clear all logs
clearConsole()

// Pause/resume logging
toggleConsolePause()
```

### Console API
```javascript
// Log an API request
logApiRequest(url, method, data)

// Log API success
logApiSuccess(url, method, response)

// Log API error
logApiError(url, method, error)

// Log user action
logUserAction(action, details)

// Log system event
logSystem(message, details)
```

## Tips

1. **Keep Console Open**: During development, keep the console expanded at the bottom to monitor activities in real-time

2. **Use Pause**: When performing multiple actions, pause logging to avoid log spam, then resume

3. **Clear Before Testing**: Clear console before testing a specific feature to make it easier to find relevant logs

4. **Watch for Errors**: Red logs indicate API errors - investigate these immediately

5. **Monitor LTP**: Yellow system logs show LTP refresh cycles - verify they're running at 15-second intervals

6. **Track Order Flow**: Purple user action logs + blue API request logs show the complete order placement flow

## Best Practices

1. **Check Console First**: When encountering issues, always check the console for error messages

2. **Monitor in Real-Time**: Watch the console while performing actions to see the complete flow

3. **Use for QA**: During testing, use the console to verify all expected API calls are being made

4. **Debug Efficiently**: Instead of adding console.log statements, use the built-in logging system

5. **Verify API Calls**: Use the console to ensure the correct endpoints and payloads are being used

---

**Status**: ✅ Implemented and Running
**Backend Server**: http://localhost:3000
**Dashboard**: http://localhost:3000/dashboard.html

The console is now active and ready to help with development and debugging!

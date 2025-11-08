import axios from 'axios';
import path from 'path';
import fs from 'fs'; 
import { promisify } from 'util';
import { ExportFilePath } from '../global.js';
// Promisify the fs callback-based functions to use them with async/await
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const utimes = promisify(fs.utimes);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const messagesJsonPath = path.join(ExportFilePath, 'timeline_messages.json');
const groupsJsonPath = path.join(ExportFilePath, 'groups.json');
class ApiClient {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }

    /**
     * A helper method to perform authenticated requests using axios.
     * @param {string} endpoint - The API endpoint path.
     * @param {object} options - The options for the axios request.
     * @returns {Promise<any>} The data from the API response.
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        // Default headers, can be overridden by options.headers
        // Default headers, can be overridden by options.headers
        const headers = {
            'accept': 'application/json',
            'accept-encoding': 'gzip',
            'accept-language': 'en-US;q=1.0',
            'Content-Type': 'application/json',
            'host': 'api.kh.glastonr.net',
            'user-agent': 'Dart/3.7 (dart:io)',
            'x-talk-app-id': 'jp.co.sonymusic.communication.keyakizaka 2.5',
            'x-talk-app-platform': 'Android', // Or 'iOS', as needed
            'Authorization': `Bearer ${this.token}`,
            ...options.headers,
        };


        const config = {
            method: options.method || 'GET',
            url,
            headers,
            data: options.body, // for POST/PUT requests
            params: options.params, // for GET request query parameters
        };

        console.log(`Making API request: ${config.method} ${url}`);

        try {
            const response = await axios(config);
            // axios returns the response data in the 'data' property
            // and handles JSON parsing automatically.
            return response.data;
        } catch (error) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('API Error Response:', error.response.data);
                throw new Error(`API request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // The request was made but no response was received
                throw new Error(`API request failed: No response received. ${error.message}`);
            } else {
                // Something happened in setting up the request that triggered an Error
                throw new Error(`API request setup failed: ${error.message}`);
            }
        }
    }

    /**
     * Fetches group data.
     * Corresponds to: GET /v2/groups
     * @returns {Promise<Array<object>>} A list of Groups.
     */
    async getGroups() {
        return this.request('/v2/groups');
    }

    /**
     * Fetches timeline data.
     * Corresponds to: GET /v2/timeline
     * @param {object} params - The query parameters.
     * @param {string} [params.created_from] - ISO 8601 timestamp.
     * @param {string} [params.updated_from] - ISO 8601 timestamp.
     * @param {number} [params.count] - Number of items to fetch.
     * @param {string} [params.order] - Sort order ('asc' or 'desc').
     * @returns {Promise<object>} A Timeline object.
     */
    async getTimeline(params = {}, memberId) {
        // Filters out empty parameters and lets axios build the query string
        const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
        return this.request(`/v2/groups/${memberId}/timeline`, { params: cleanParams });
    }

    /**
     * Updates the access token using a refresh token.
     * Corresponds to: POST /v2/update_token
     * @param {object} body - The request body (UpdateTokenReq).
     * @param {string} body.refresh_token - The refresh token to use.
     * @returns {Promise<object>} An UpdateToken object with the new access_token.
     */
    async updateToken(UpdateTokenReq) {
        const endpoint = '/v2/update_token';
        const updatedTokenResponse = await this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(UpdateTokenReq),
            // Auth header is not needed for this specific request
            headers: { 'Authorization': undefined }
        });

        // Update the client's internal token for subsequent requests
        if (updatedTokenResponse && updatedTokenResponse.access_token) {
            this.token = updatedTokenResponse.access_token;

            console.log('Access token has been updated.');
            return updatedTokenResponse;
        }

        return null;
    }

    /**
     * Fetches past messages.
     * Corresponds to: GET /v2/past_messages
     * @returns {Promise<object>} A PastMessages object.
     */
    async getPastMessages() {
        return this.request('/v2/past_messages');
    }
}

export async function runApiExample() {
    console.log('\n--- Running API Client Example ---');

    const API_BASE_URL = 'https://api.kh.glastonr.net';
    const refreshToken = '87b71136-107d-4660-86d1-db84d22c234c';
    // NOTE: A valid accessToken is required for most calls.
    // The updateToken call would typically be the first one you make.
    const apiClient = new ApiClient(API_BASE_URL, null);

    try {
        // Example 1: Update the token (Uncomment and add your refresh token to use)
        // console.log('\nAttempting to update token...');

        const tokenData = await apiClient.updateToken({ refresh_token: refreshToken });
        if (!tokenData) {
            throw new Error('Failed to update token. Please check your refresh token.');
        }
        console.log('Successfully updated token:', tokenData);

        // After updating the token, the client is ready to make other authenticated calls.


        // Example 2: Get groups
        console.log('\nFetching groups...');
        const groups = await apiClient.getGroups();
        console.log('Received groups:', JSON.stringify(groups, null, 2));

        // 1. Save all message metadata to a single JSON file
        await writeFile(groupsJsonPath, JSON.stringify(groups, null, 2));
        console.log(`✅ Successfully saved message metadata to ${messagesJsonPath}`);


        // Example 3: Get timeline with parameters
        console.log('\nFetching timeline...');
        const timelineParams = {
            updated_from: '2025-10-01T00:00:00Z',
            count: 200,
            order: 'desc'
        };
        const timeline = await apiClient.getTimeline(timelineParams, 62);

        console.log('Received timeline:', JSON.stringify(timeline, null, 2));
        await processTimeline(timeline);


    } catch (error) {
        console.error('❌ An error occurred during the API example:', error.message);
    }
}

const API_TYPE_TO_CODE = {
    'text': '0',
    'picture': '1',
    'video': '2',
    'voice': '3',
    'url': '4' // Assuming a link type might be 'url'
};

/**
 * Formats an ISO date string into YYYYMMDDHHmmss format.
 * @param {string} isoString - The ISO date string from the API.
 * @returns {string} The formatted date string.
 */
function formatDateForFilename(isoString) {
    const d = new Date(isoString);
    const pad = (num) => num.toString().padStart(2, '0');

    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hour = pad(d.getHours());
    const minute = pad(d.getMinutes());
    const second = pad(d.getSeconds());

    return `${year}${month}${day}${hour}${minute}${second}`;
}

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dirPath The path to the directory.
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Directory not found. Creating '${dirPath}'...`);
            await mkdir(dirPath, { recursive: true });
        } else {
            throw error;
        }
    }
}

/**
 * Processes the timeline data: saves messages to JSON and downloads all associated files.
 * @param {object} timelineData - The full timeline object from the API.
 */
async function processTimeline(timelineData) {
    const outputDir = ExportFilePath;


    if (!timelineData || !timelineData.messages || timelineData.messages.length === 0) {
        console.log('No messages found in the timeline data. Nothing to process.');
        return;
    }

    try {
        // Ensure the output directory exists
        await ensureDirectoryExists(outputDir);

        // 1. Save all message metadata to a single JSON file
        await writeFile(messagesJsonPath, JSON.stringify(timelineData.messages, null, 2));
        console.log(`✅ Successfully saved message metadata to ${messagesJsonPath}`);

        // 2. Iterate through messages to download content
        console.log(`\nStarting download of ${timelineData.messages.length} message contents...`);
        for (const message of timelineData.messages) {
            const typeCode = API_TYPE_TO_CODE[message.type] || '99'; // 99 for unknown
            const dateStr = formatDateForFilename(message.published_at);
            let extension = '.txt'; // Default for text
            let contentToSave;

            if (message.type === 'text') {
                contentToSave = message.text;
            } else if (message.file) {
                // Get extension from the file URL
                const url = new URL(message.file);
                extension = path.extname(url.pathname);
            }

            const filename = `${message.id}_${typeCode}_${dateStr}${extension}`;
            const filePath = path.join(outputDir, filename);

            try {
                if (message.type === 'text') {
                    await writeFile(filePath, contentToSave);
                    console.log(`[SAVED TEXT] ${filename}`);
                } 
                 if (message.file) {

                      console.log(`[DOWNLOADED] ${filename}`);
                    // Download the file using a stream
                    const response = await axios({
                        method: 'get',
                        url: message.file,
                        responseType: 'stream',
                    });
                    const writer = fs.createWriteStream(filePath);
                    response.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    console.log(`[DOWNLOADED] ${filename}`);
                }
            } catch (fileError) {
                console.error(`❌ Failed to save content for message ID ${message.id}: ${fileError.message}`);
            }
        }
        console.log('\n✅ Timeline processing complete.');

    } catch (error) {
        console.error(`❌ An unexpected error occurred during timeline processing:`, error);
    }
}
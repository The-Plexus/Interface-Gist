/*
Copyright (c) 2025 Neuroplexus

This software is provided "as is", without warranty of any kind, express or
implied, including but not limited to the warranties of merchantability,
fitness for a particular purpose and noninfringement. In no event shall the
authors or copyright holders be liable for any claim, damages or other
liability, whether in an action of contract, tort or otherwise, arising from,
out of or in connection with the software or the use or other dealings in the
software.

This software is licensed under the Neuroplexus Non-Commercial Share-Alike License (the "License");
you may not use this file except in compliance with the License.

Terms and Conditions:

1. Non-Commercial Use Only:

   This software and its associated documentation (collectively, the "Software")
   are strictly prohibited from being used, directly or indirectly, for any
   commercial purpose.  "Commercial purpose" includes, but is not limited to:
     *  Use in a product or service offered for sale or other consideration.
     *  Use in a product or service that provides a competitive advantage in a
        commercial setting.
     *  Use in internal business operations that generate revenue or provide
        cost savings directly attributable to the Software.
     *  Use in training or educational programs for which a fee is charged.
     *  Use to support any for-profit entity, regardless of whether the software
        itself is sold.
     * Reselling, or sublicensing this software.
    If you require a commercial license, please contact Neuroplexus at isneuroplexus@duck.com.

2. Attribution and Original Author/Project Notice:

   Any use, distribution, or modification of the Software (in whole or in part)
   must prominently include the following:
     *  The original copyright notice: `Copyright (c) 2025 Neuroplexus`
     *  A clear and unambiguous statement identifying Neuroplexus as the original
        author of the Software.
     *  A link or reference to the original project location (e.g., a URL to a
        repository, if applicable).  For example: "Based on the Neuroplexus
        HuanyuanInterface project, available at https://linux.do/t/topic/507324.

3. Share-Alike (Derivative Works):

   If you modify the Software, any distribution of the modified version (the
   "Derivative Work") must be licensed under the *same* terms and conditions as
   this License (Neuroplexus Non-Commercial Share-Alike License).  This means:
     *  The Derivative Work must also be restricted to non-commercial use.
     *  The Derivative Work must include the attribution requirements outlined
        in Section 2.
     *  The source code of the Derivative Work must be made available under
        this same License.

4. Modification Notices:

    Any Derivative Work must include prominent notices stating that you have
    modified the Software, and the date and nature of the changes made. These
    notices must be placed:
      *  In the source code files that have been modified.
      *  In a separate `CHANGELOG` or `MODIFICATIONS` file included with the
         Derivative Work's distribution.  This file should clearly list all
         modifications made to the original Software.

5. No Endorsement:

   The names of Neuroplexus or its contributors may not be used to endorse or
   promote products derived from this Software without specific prior written
   permission.

6. Termination:

   This License automatically terminates if you violate any of its terms and
   conditions.  Upon termination, you must cease all use, distribution, and
   modification of the Software and destroy all copies in your possession.

7.  Severability:

   If any provision of this License is held to be invalid or unenforceable, the
   remaining provisions shall remain in full force and effect.

8. Governing Law:

    This License shall be governed by and construed in accordance with the laws
    of New South Wales, Australia, without
    regard to its conflict of law principles.

9. Entire Agreement:

	This license constitutes the entire agreement with respect to the software.
	Neuroplexus is not bound by any additional provisions that may appear in any
	communication from you.
*/

import { Application, Router, Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Buffer } from "https://deno.land/std@0.152.0/io/buffer.ts";  // Not used, can be removed

const HUNYUAN_API_URL = "http://llm.hunyuan.tencent.com/aide/api/v2/triton_image/demo_text_chat/"; // Consider making this configurable
const DEFAULT_STAFFNAME = "staryxzhang"; // Consider making this configurable
const DEFAULT_WSID = "10697";          // Consider making this configurable
const API_KEY = "7auGXNATFSKl7dc";       // Consider loading this from an environment variable or config file

interface HunyuanMessage {
    role: string;
    content: string;
    reasoning_content?: string;
}

interface HunyuanRequest {
    stream: boolean;
    model: string;
    query_id: string;
    messages: HunyuanMessage[];
    stream_moderation: boolean;
    enable_enhancement: boolean;
}

// These interfaces can be combined for better readability
interface OpenAIChoiceBase {
    index: number;
    finish_reason: string | null;
}

interface OpenAIChoiceDelta extends OpenAIChoiceBase {
    delta: {
        role?: string;
        content?: string;
        reasoning_content?: string;
    };
}

interface OpenAIChoiceNonStream extends OpenAIChoiceBase {
    message: {
        role: string;
        content: string;
        reasoning_content?: string;
    };
}

interface OpenAIStreamResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    system_fingerprint: string;
    choices: OpenAIChoiceDelta[];
    note?: string;  // Rarely used, consider removing if not needed
}

interface OpenAIResponseNonStream {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: OpenAIChoiceNonStream[];
    usage?: {  // Placeholder for now
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIModel {
    id: string;
    object: string;
    created: number;
    owned_by: string;
}

interface OpenAIModelsResponse {
    object: string;
    data: OpenAIModel[];
}

// Helper function to get Hunyuan model name from OpenAI model name
function getHunyuanModelName(openaiModelName: string): string {
    switch (openaiModelName) {
        case "hunyuan-turbos-latest":
            return "hunyuan-turbos-latest";
        case "hunyuan-t1-latest": // Fallthrough is intentional
        default:
            return "hunyuan-t1-latest";
    }
}

async function hunyuanToOpenAIStream(
    hunyuanResponse: Response,
    openaiModelName: string,
): Promise<ReadableStream<string>> {
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    return new ReadableStream<string>({
        async start(controller) {
            if (!hunyuanResponse.body) {
                controller.close();
                return;
            }
            const reader = hunyuanResponse.body.getReader();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { break; }
                    buffer += decoder.decode(value);

                    let boundary = buffer.indexOf("\n\n");
                    while (boundary !== -1) {
                        const chunk = buffer.substring(0, boundary).trim();
                        buffer = buffer.substring(boundary + 2);
                        boundary = buffer.indexOf("\n\n");

                        if (chunk.startsWith("data:")) {
                            const jsonStr = chunk.substring(5).trim();
                            if (jsonStr === "[DONE]") {
                                controller.enqueue(`data: [DONE]\n\n`);
                                continue;
                            }
                            try {
                                const hunyuanData = JSON.parse(jsonStr);
                                const openaiData: OpenAIStreamResponse = {
                                    id: hunyuanData.id,
                                    object: "chat.completion.chunk",
                                    created: hunyuanData.created,
                                    model: openaiModelName,
                                    system_fingerprint: hunyuanData.system_fingerprint,
                                    choices: hunyuanData.choices.map((choice): OpenAIChoiceDelta => ({
                                        delta: {
                                            role: choice.delta.role,
                                            content: choice.delta.content,
                                            reasoning_content: choice.delta.reasoning_content,
                                        },
                                        index: choice.index,
                                        finish_reason: choice.finish_reason,
                                    })),
                                };
                                controller.enqueue(`data: ${JSON.stringify(openaiData)}\n\n`);
                            } catch (error) {
                                console.error("Error parsing stream chunk:", error, jsonStr);
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
                controller.close();
            }
        },
    });
}
async function hunyuanToOpenAINonStream(
    hunyuanResponse: Response,
    openaiModelName: string,
): Promise<OpenAIResponseNonStream> {
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let allChoices: OpenAIChoiceNonStream[] = []; // Accumulate choices
    let finalId = "";
    let finalCreated = 0;
    let finalModel = openaiModelName;


    if (!hunyuanResponse.body) {
        throw new Error("Hunyuan response body is empty.");
    }
    const reader = hunyuanResponse.body.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            const text = decoder.decode(value);
            buffer += text;

            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
                const chunk = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 2);
                boundary = buffer.indexOf("\n\n");

                if (chunk.startsWith("data:")) {
                    const jsonStr = chunk.substring(5).trim();

                    if (jsonStr === "[DONE]") {
                        continue;
                    }

                    try {
                        const hunyuanData: OpenAIStreamResponse = JSON.parse(jsonStr);  // Correct type
                        finalId = hunyuanData.id; // Get id and created from last chunk
                        finalCreated = hunyuanData.created;

                        // Accumulate choices, extracting content correctly.
                        hunyuanData.choices.forEach(choice => {
                            const existingChoice = allChoices.find(c => c.index === choice.index);
                            if (existingChoice) {
                                //append new content
                                existingChoice.message.content += choice.delta.content || "";
                                existingChoice.message.reasoning_content = (existingChoice.message.reasoning_content || "") + (choice.delta.reasoning_content || "");
                                if (choice.finish_reason) {
                                    existingChoice.finish_reason = choice.finish_reason;
                                }
                            } else {
                                //new choice
                                allChoices.push({
                                    message: {
                                        role: choice.delta.role || "assistant",  // Default to "assistant" if role is missing
                                        content: choice.delta.content || "",
                                        reasoning_content: choice.delta.reasoning_content,
                                    },
                                    index: choice.index,
                                    finish_reason: choice.finish_reason,
                                });
                            }
                        });

                    } catch (error) {
                        console.error("Error parsing Hunyuan response chunk:", error, "Chunk:", jsonStr);
                        throw new Error(`Error parsing Hunyuan response: ${error}`);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (allChoices.length === 0) {
        throw new Error("Failed to receive data from Hunyuan API.");
    }

    const openaiResponse: OpenAIResponseNonStream = {
        id: finalId,
        object: "chat.completion",
        created: finalCreated,
        model: finalModel,
        choices: allChoices,
        usage: {  // Still placeholder, see notes below
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
    return openaiResponse;
}

async function handleChatCompletion(ctx: Context) {
    try {
        const authHeader = ctx.request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized: Missing or invalid API key" };
            return;
        }
        const apiKey = authHeader.substring(7);

        const body = await ctx.request.body({ type: "json" }).value;

        if (!body || !body.messages || !Array.isArray(body.messages)) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid request body: 'messages' array is required." };
            return;
        }

        const openaiModel = body.model || "hunyuan-t1-latest";
        const hunyuanModel = getHunyuanModelName(openaiModel);
        const stream = body.stream !== undefined ? body.stream : true;

        const hunyuanMessages: HunyuanMessage[] = body.messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            reasoning_content: msg.reasoning_content, // Pass through reasoning_content
        }));

        const hunyuanRequest: HunyuanRequest = {
            stream: true,  // Always stream to Hunyuan, then handle streaming/non-streaming for OpenAI
            model: hunyuanModel,
            query_id: crypto.randomUUID().replaceAll("-", ""),
            messages: hunyuanMessages,
            stream_moderation: true,
            enable_enhancement: false,
        };


        const hunyuanResponse = await fetch(HUNYUAN_API_URL, {
            method: "POST",
            headers: {
                "Host": "llm.hunyuan.tencent.com",
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0", // Consider making this configurable
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.5",  // Consider making this configurable
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Referer": "https://llm.hunyuan.tencent.com/",
                "Content-Type": "application/json",
                "model": hunyuanModel, // Use the determined Hunyuan model
                "polaris": "stream-server-online-sbs-10697",
                "Authorization": `Bearer ${apiKey}`,
                "Wsid": DEFAULT_WSID,
                "staffname": DEFAULT_STAFFNAME,
                "Origin": "https://llm.hunyuan.tencent.com",
                "DNT": "1",
                "Sec-GPC": "1",
                "Connection": "keep-alive",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "Priority": "u=0",
                "Pragma": "no-cache",
                "Cache-Control": "no-cache",
                "TE": "trailers",
            },
            body: JSON.stringify(hunyuanRequest),
        });

        if (!hunyuanResponse.ok) {
            const errorText = await hunyuanResponse.text();
            console.error("Hunyuan API error:", hunyuanResponse.status, errorText);
            ctx.response.status = hunyuanResponse.status;
            ctx.response.body = { error: `Hunyuan API error: ${hunyuanResponse.status} - ${errorText}` };
            return;
        }

        if (stream) {
            const openaiStream = await hunyuanToOpenAIStream(hunyuanResponse, openaiModel);
            ctx.response.body = openaiStream;
            ctx.response.type = "text/event-stream";
        } else {
            const openaiResponse = await hunyuanToOpenAINonStream(hunyuanResponse, openaiModel);
            ctx.response.body = openaiResponse;
            ctx.response.type = "application/json";
        }

    } catch (error) {
        console.error("Error in chat completion:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal Server Error" };
    }
}

async function handleModels(ctx: Context) {
    const models: OpenAIModelsResponse = {
        object: "list",
        data: [
            {
                id: "hunyuan-t1-latest",
                object: "model",
                created: Math.floor(Date.now() / 1000),
                owned_by: "tencent",
            },
            {
                id: "hunyuan-turbos-latest",
                object: "model",
                created: Math.floor(Date.now() / 1000), // Use current timestamp
                owned_by: "tencent",
            }
        ],
    };
    ctx.response.body = models;
    ctx.response.type = "application/json";
}

const sharedStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --background: #f0f2f5;
  --foreground: #2e3440;
  --primary: #5e81ac;
  --primary-foreground: #eceff4;
  --card: #ffffff;
  --card-foreground: #2e3440;
  --muted: #d8dee9;
  --muted-foreground: #4c566a;
  --border: #d8dee9;
  --radius: 8px;
  --header-bg: #3b4252;
  --header-fg: #eceff4;
  --link-color: #81a1c1;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', sans-serif;
  background-color: var(--background);
  color: var(--foreground);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  line-height: 1.6;
}

.header {
  background-color: var(--header-bg);
  color: var(--header-fg);
  padding: 1rem 0;
  width: 100%;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1rem;
}

.header a {
  color: var(--header-fg);
  text-decoration: none;
  margin: 0 1rem;
  font-weight: 500;
  transition: color 0.2s;
}

.header a:hover {
  color: var(--link-color);
}
.branding {
  font-size: 1.25rem;
  font-weight: 600;
}


.container {
  width: 100%;
  max-width: 48rem;
  margin: 1.5rem auto;
  padding: 0 1rem;
  flex-grow: 1;
}

.card {
  background-color: var(--card);
  border-radius: var(--radius);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 2.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--foreground);
  text-align: center;
}

h2 {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--foreground);
}

h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    color: var(--foreground);
}

p {
  color: var(--muted-foreground);
  font-size: 1rem;
  margin-bottom: 1rem;
  line-height: 1.5;
}

a {
    color: var(--link-color);
    text-decoration: none;
}
a:hover {
    text-decoration: underline;
}

pre {
    background-color: var(--muted);
    padding: 1rem;
    border-radius: var(--radius);
    overflow-x: auto;
    margin-bottom: 1rem;
    border: 1px solid var(--border);
    line-height: 1.4;
}

code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.875rem;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: var(--radius);
  height: 2.75rem;
  padding: 0 1.25rem;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
  text-decoration: none;
  background-color: var(--primary);
  color: var(--primary-foreground);
  border: none;
}

.button:hover {
  opacity: 0.9;
}

.footer {
  margin-top: auto;
  padding: 1rem 0;
  text-align: center;
  color: var(--muted-foreground);
  border-top: 1px solid var(--border);
  width: 100%;
}

.footer a {
    color: var(--link-color);
}
`;


const header = `
    <div class="header">
        <div class="header-content">
            <span class="branding">Hunyuan Proxy</span>
            <div>
                <a href="/">Home</a>
                <a href="/playground">Playground</a>
                <a href="/docs">Docs</a>
                <a href="/getkey">Get API Key</a>
            </div>
        </div>
    </div>
`;


const homePage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hunyuan OpenAI Proxy</title>
    <style>${sharedStyles}</style>
</head>
<body>
    ${header}
    <div class="container">
        <h1>Hunyuan OpenAI Proxy</h1>
        <div class="card">
           <h2>Welcome</h2>
            <p>This is a proxy server that converts the Tencent Hunyuan LLM API to an OpenAI-compatible API.</p>
            <p>You can use this proxy to access the Hunyuan LLM with any OpenAI-compatible client.</p>
        </div>
    </div>
    <div class="footer">
        <p>Powered by <a href="https://neuroplexus.my" target="_blank">Neuroplexus</a></p>
    </div>
</body>
</html>
`;


const playgroundPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hunyuan Playground</title>
    <style>${sharedStyles}
        textarea, #output {
            width: 100%;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 1rem;
            margin-bottom: 1rem;
            font-family: inherit;
            font-size: 1rem;
            resize: vertical;
            color: var(--foreground);
        }
        textarea { min-height: 10rem; }
        #output { min-height: 15rem; background-color: var(--muted); overflow-y: auto; }
        .button { width: 100%; }

    </style>
</head>
<body>
    ${header}
    <div class="container">
        <h1>Hunyuan Playground</h1>
        <div class="card">
            <textarea id="input" placeholder="Enter your prompt here..."></textarea>
            <button class="button" onclick="sendMessage()">Send</button>
            <div id="output"></div>
        </div>
    </div>
    <div class="footer">
        <p>Powered by <a href="https://neuroplexus.my" target="_blank">Neuroplexus</a></p>
    </div>
    <script>
        const apiKey = "${API_KEY}";  // Consider making this dynamic
        async function sendMessage() {
            const input = document.getElementById('input').value;
            const outputDiv = document.getElementById('output');
            outputDiv.innerHTML = '';

            const response = await fetch('/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey,
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: input }],
                    stream: true,
                }),
            });

            if (!response.ok) {
                outputDiv.innerHTML = 'Error: ' + response.statusText;
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

             try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                     buffer += decoder.decode(value, { stream: true });

                    let boundary = buffer.indexOf("\\n\\n");
                    while (boundary !== -1) {
                        const chunk = buffer.substring(0, boundary).trim();
                         buffer = buffer.substring(boundary + 2);
                         boundary = buffer.indexOf("\\n\\n");

                        if (chunk.startsWith("data:")) {
                           const jsonStr = chunk.substring(5).trim();

                            if (jsonStr === "[DONE]") {
                                 continue
                            }
                            try {
                                const data = JSON.parse(jsonStr);
                                if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                                    outputDiv.innerHTML += data.choices[0].delta.content;
                                    outputDiv.scrollTop = outputDiv.scrollHeight;
                                }
                             } catch (error) {
                                    console.error("Error parsing JSON:", error);
                                    outputDiv.innerHTML += "Error parsing response chunk. ";
                                }
                        }
                    }
                }
            } finally {
              reader.releaseLock();
            }
        }
    </script>
</body>
</html>
`;

const docsPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation</title>
    <style>${sharedStyles}</style>
</head>
<body>
    ${header}
    <div class="container">
        <h1>API Documentation</h1>
        <div class="card">
            <h2>Chat Completions</h2>
            <p>This endpoint mimics the OpenAI Chat Completion API.</p>
            <h3>Endpoint</h3>
            <pre><code>POST /v1/chat/completions</code></pre>
            <h3>Request Headers</h3>
            <pre><code>Authorization: Bearer YOUR_API_KEY</code></pre>
            <pre><code>Content-Type: application/json</code></pre>

            <h3>Request Body (Example)</h3>
            <pre><code>{
  "messages": [
    {
      "role": "user",
      "content": "Hello, who are you?"
    }
  ],
  "model": "hunyuan-t1-latest",
  "stream": true
}</code></pre>
            <p>Supported models: <code>hunyuan-t1-latest</code>, <code>hunyuan-turbos-latest</code>.  To make a non-streaming request, set <code>"stream": false</code> in the request body.</p>
        <h3>Response</h3>
            <p>Returns a stream of Server-Sent Events (SSE) in the OpenAI format for streaming requests, or a JSON object for non-streaming requests.</p>
         </div>

          <div class="card">
             <h2>Models</h2>
            <p>Get a list of available models.</p>
            <h3>Endpoint</h3>
             <pre><code>GET /v1/models</code></pre>
             <h3>Response (Example)</h3>
              <pre><code>
{
  "object": "list",
  "data": [
    {
      "id": "hunyuan-t1-latest",
      "object": "model",
      "created": 1678886400,
      "owned_by": "tencent"
    },
    {
      "id": "hunyuan-turbos-latest",
      "object": "model",
      "created": 1700000000,
      "owned_by": "tencent"
    }
  ]
}
              </code></pre>
          </div>
         <div class="card">
            <h2>Get API Key</h2>
            <p>Retrieves the API key.</p>
            <h3>Endpoint</h3>
            <pre><code>GET /getkey</code></pre>
          </div>
    </div>
    <div class="footer">
        <p>Powered by <a href="https://neuroplexus.my" target="_blank">Neuroplexus</a></p>
    </div>
</body>
</html>
`;

const getKeyPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Get API Key</title>
    <style>${sharedStyles}</style>
</head>
<body>
    ${header}
    <div class="container">
        <h1>Get API Key</h1>
        <div class="card">
            <p>Your API Key is: <code>${API_KEY}</code></p>
        </div>
    </div>
    <div class="footer">
        <p>Powered by <a href="https://neuroplexus.my" target="_blank">Neuroplexus</a></p>
    </div>
</body>
</html>
`;
async function handleGetKey(ctx: Context) {
    const acceptHeader = ctx.request.headers.get("Accept");
    if (acceptHeader && acceptHeader.includes("application/json")) {
        ctx.response.body = { key: API_KEY };
        ctx.response.type = "application/json";
    } else {
        ctx.response.body = getKeyPage;
        ctx.response.type = "text/html";
    }
}

async function handleHomePage(ctx: Context) {
    ctx.response.body = homePage;
    ctx.response.type = "text/html";
}

async function handlePlayground(ctx: Context) {
    ctx.response.body = playgroundPage;
    ctx.response.type = "text/html";
}

async function handleDocs(ctx: Context) {
    ctx.response.body = docsPage;
    ctx.response.type = "text/html";
}

const router = new Router();
router.post("/v1/chat/completions", handleChatCompletion);
router.get("/v1/models", handleModels);
router.get("/getkey", handleGetKey);
router.get("/", handleHomePage);
router.get("/playground", handlePlayground);
router.get("/docs", handleDocs);

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server listening on port 8000");
await app.listen({ port: 8000 });

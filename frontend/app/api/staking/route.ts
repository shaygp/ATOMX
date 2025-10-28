import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = 'https://buildstation.stakingfacilities.com';
const API_KEY = process.env.STAKING_FACILITIES_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { error: 'Staking Facilities API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    
    // Validate JSON-RPC request structure
    if (!body.jsonrpc || !body.method || !body.id) {
      return NextResponse.json(
        { error: 'Invalid JSON-RPC request' },
        { status: 400 }
      );
    }

    const response = await fetch(`${API_BASE_URL}/?api-key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Staking API proxy error:', error);
    return NextResponse.json(
      { 
        jsonrpc: '2.0',
        error: { 
          code: -32603, 
          message: 'Internal error' 
        },
        id: null 
      },
      { status: 500 }
    );
  }
}
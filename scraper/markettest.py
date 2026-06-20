import requests
import json

def fetch_oem_incentives(api_key, secret, zip_code=None, make=None, offer_type=None, limit=100):
    """
    Fetches OEM incentives from the MarketCheck API with pagination support.

    :param api_key: Your MarketCheck API key
    :param secret: Your MarketCheck API secret key
    :param zip_code: 5-digit ZIP code to find localized offers (e.g., '90210')
    :param make: Filter by vehicle manufacturer (e.g., 'Toyota')
    :param offer_type: Filter by 'lease', 'finance', or 'cash'
    :param limit: Total maximum number of records you want to fetch
    :return: A list of all fetched incentive objects
    """
    url = "https://api.marketcheck.com/v2/search/car/incentive/oem"

    headers = {
        "Host": "api.marketcheck.com",
        "api_secret": secret
    }

    # api_key sent as query param (standard MarketCheck auth)
    params = {
        "api_key": api_key,
        "rows": 50,
        "start": 0
    }
    
    # Add optional filters if provided
    if zip_code:   params["zip"] = zip_code
    if make:       params["make"] = make
    if offer_type: params["offer_type"] = offer_type

    all_incentives = []
    
    print("Starting incentive data fetch...")
    
    while params["start"] < limit:
        print(f"Fetching rows {params['start']} to {params['start'] + params['rows']}...")
        
        try:
            response = requests.get(url, headers=headers, params=params)
            
            # Check for HTTP errors
            if response.status_code == 401:
                print("Error: Unauthorized. Please check your API key.")
                break
            elif response.status_code != 200:
                print(f"Error: API returned status code {response.status_code}")
                print(response.text)
                break
                
            data = response.json()
            
            # Extract the list of incentives (usually found under 'incentives' or 'data' key depending on specific API version schema)
            # Adjust the key based on MarketCheck's exact current JSON root wrapper if needed
            incentives_page = data.get("incentives", data.get("num_found", [])) 
            
            # Safely handle if 'incentives' list is returned
            if isinstance(data, dict) and "incentives" in data:
                incentives_page = data["incentives"]
            elif isinstance(data, list):
                incentives_page = data
            else:
                incentives_page = []

            if not incentives_page:
                print("No more records found. Ending loop.")
                break
                
            all_incentives.extend(incentives_page)
            
            # If we received fewer rows than we asked for, we've reached the end of the data
            if len(incentives_page) < params["rows"]:
                print("Reached the last page of available records.")
                break
                
            # Move the pointer forward for the next page
            params["start"] += params["rows"]
            
        except requests.exceptions.RequestException as e:
            print(f"Network error occurred: {e}")
            break

    print(f"Successfully fetched {len(all_incentives)} total incentives.")
    return all_incentives


# --- Example Usage ---
if __name__ == "__main__":
    YOUR_API_KEY = "IOWYIN4dz6FxgmFMzEAmJQSQFUsyBXm0"
    YOUR_SECRET  = "SBaQrcH6D9SamyAg"

    target_zip  = "90210"
    target_make = "Hyundai"
    target_type = "lease"

    results = fetch_oem_incentives(
        api_key=YOUR_API_KEY,
        secret=YOUR_SECRET,
        zip_code=target_zip,
        make=target_make,
        offer_type=target_type,
        limit=200
    )
    
    # Pretty-print the first incentive program returned as a sample
    if results:
        print("\n--- SAMPLE INCENTIVE RECORD ---")
        print(json.dumps(results[0], indent=4))
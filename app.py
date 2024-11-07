import requests
import json

# UPS Rate API URL
url = "https://onlinetools.ups.com/api/rating/v2409/Rate"

# Request Headers
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer eyJraWQiOiI2NGM0YjYyMC0yZmFhLTQzNTYtYjA0MS1mM2EwZjM2Y2MxZmEiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzM4NCJ9.eyJzdWIiOiJpbmZvQHByb2tlZXBlcnNsaW5lLmNvbSIsImNsaWVudGlkIjoiWUVvS0NjdmcyVVFIc25waWh0TGo5c25nZ1M0R05tcVRjdlVvWUdBcUFaTFVNaklyIiwiaXNzIjoiaHR0cHM6Ly9hcGlzLnVwcy5jb20iLCJ1dWlkIjoiQkNFMjYwMUEtNzFFMy0xRkI2LUI4REYtN0MwNkMwQjRGODBEIiwic2lkIjoiNjRjNGI2MjAtMmZhYS00MzU2LWIwNDEtZjNhMGYzNmNjMWZhIiwiYXVkIjoicHJva2VlcGVyc2xpbmUiLCJhdCI6IkFMcHlvdlNnY3lweFFMN2p4eUMxTGdxcnVKWmIiLCJuYmYiOjE3MzA5OTE5NTYsIkRpc3BsYXlOYW1lIjoicHJva2VlcGVyc2xpbmUiLCJleHAiOjE3MzEwMDYzNTYsImlhdCI6MTczMDk5MTk1NiwianRpIjoiMmQ1NDAwYzMtNTg2Mi00M2Q5LWIwYmYtZWU3YTBkNTQwNWVlIn0.txeSN-cNEs-iYs5whGmMQ0edwhlrFGz9I27nLWGs8lKWF08i_EvWcmOJZZPUaz57fQBI4BZ9MUU6b80_sNb0Vbe8Gao8n8WPbJr7zSDvl_gvsHrn9-tRQZdZmrVBXw09__9jnTkVk5DJ9rL7sfMO13JjG8VjMSU71-N8kK5S9pUSeynqpU8eRIVK5se9BZMPnHACSLZBG28W2CLD1_Ra7OK4T7gacMcTjSM9ung5s_FLyom8dAyGWxk8PgaLmzdEW5NpA75jdpOgyW6sWV43OFuK_U5L5UmFNkGIph5FpUZ1rdZEaihq34LVHXc_d7JEt6EJrAyWZgUfijcEfudSx0jNuFQyt7xDpWCNL1NbzYTUiZUKTvcs-grSnDKYMbvFABLxjlq0vRq-G66bobwL58avRH1PddPE4cWV_0zi8q6irGcK9EnIDGG_j15v9U3lGKfqTR7wr0xWw5B74H_SmxmwXm3l6R16DqY0y0h_moSAJYy8srirWVm3l1jDIOcra7e21SqInlPc7LLcDwd3U3wzVSz5vjYjCpViTjCJXSBKksCMvIEkR0tkeDlPTgH_ERK2mCQK1-xA1T4ZX2Y5GgOapQVY8Ce8wQGwb6fFoUXOJsV5G1VWzJf1JPNkga1VM3lP_BLxBEl6Ub2ExnpHxFT-LAUl6pdr1YB01B2EsRQ"
}

# Request Body
payload = {
    "RateRequest": {
        "Request": {
            "TransactionReference": {
                "CustomerContext": "test"
            }
        },
        "Shipment": {
            "Shipper": {
                "Name": "Pro Keepers Line GmbH",
                "ShipperNumber": "G224H8",
                "Address": {
                    "AddressLine": [
                        "Industriestraat 345"
                    ],
                    "City": "Tegelen",
                    "StateProvinceCode": "PJ",
                    "PostalCode": "5931",
                    "CountryCode": "NL"
                }
            },
            "ShipTo": {
                "Name": "Max Mustermann",
                "Address": {
                    "AddressLine": [
                        "3851 Pleasant Hill Road"
                    ],
                    "City": "Boca Raton",
                    "StateProvinceCode": "FL",
                    "PostalCode": "33487",
                    "CountryCode": "US"
                }
            },
            "ShipFrom": {
                "Name": "Pro Keepers Line GmbH",
                "Address": {
                    "AddressLine": [
                        "Industriestraat 345"
                    ],
                    "City": "Tegelen",
                    "StateProvinceCode": "PJ",
                    "PostalCode": "5931",
                    "CountryCode": "NL"
                }
            },
            "PaymentDetails": {
                "ShipmentCharge": [
                    {
                        "Type": "01",
                        "BillShipper": {
                            "AccountNumber": "G224H8"
                        }
                    }
                ]
            },
            "Service": {
                "Code": "65",
                "Description": "UPS Worldwide Saver"
            },
            "NumOfPieces": "1",
            "Package": {
                "PackagingType": {
                    "Code": "02",
                    "Description": "Packaging"
                },
                "Dimensions": {
                    "UnitOfMeasurement": {
                        "Code": "CM",
                        "Description": "Centimeter"
                    },
                    "Length": "10",
                    "Width": "10",
                    "Height": "10"
                },
                "PackageWeight": {
                    "UnitOfMeasurement": {
                        "Code": "KGS",
                        "Description": "Kilograms"
                    },
                    "Weight": "1"
                }
            },
            "ShipmentRatingOptions": {
                "NegotiatedRatesIndicator": "Y"
            }
        }
    }
}

# Sending the request
response = requests.post(url, headers=headers, json=payload)
print(url)
print(headers)
print(payload)
# Checking the response status
if response.status_code == 200:
    # Parsing the JSON response
    data = response.json()
    print(json.dumps(data, indent=4))
else:
    print(f"Error: {response.status_code}")
    print(response.text)

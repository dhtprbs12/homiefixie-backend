// Direct store search - more accurate approach

interface ProductResult {
  name: string;
  image_url: string;
  product_url: string;
  price?: string;
  store: string;
}

// Check if a product name is relevant to the search query
function isProductRelevant(query: string, productName: string): boolean {
  const queryLower = query.toLowerCase();
  const productLower = productName.toLowerCase();
  
  // Extract key terms from the query (remove common words)
  const commonWords = ['for', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'inch', 'ft', 'foot', 'yard', 'pack', 'set'];
  const queryWords = queryLower.split(/[\s\-_]+/).filter(word => 
    word.length > 2 && !commonWords.includes(word)
  );
  
  // Category-specific relevance rules
  const categoryRules = {
    // Painting & Wall Repair
    paint: {
      synonyms: ['paint', 'coating', 'finish'],
      conflicts: ['primer', 'sealer', 'stain', 'varnish', 'remover']
    },
    primer: {
      synonyms: ['primer', 'sealer', 'undercoat'],
      conflicts: ['paint', 'topcoat', 'finish']
    },
    spackling: {
      synonyms: ['spackling', 'compound', 'filler', 'patch'],
      conflicts: ['paint', 'primer', 'caulk']
    },
    caulk: {
      synonyms: ['caulk', 'sealant', 'silicone'],
      conflicts: ['paint', 'primer', 'adhesive']
    },
    sandpaper: {
      synonyms: ['sandpaper', 'sanding', 'abrasive', 'grit'],
      conflicts: ['paint', 'primer', 'brush', 'roller']
    },
    
    // Plumbing
    pipe: {
      synonyms: ['pipe', 'tubing', 'conduit'],
      conflicts: ['electrical', 'wire', 'cable']
    },
    fitting: {
      synonyms: ['fitting', 'connector', 'coupling', 'elbow', 'tee'],
      conflicts: ['electrical', 'wire']
    },
    
    // Electrical
    wire: {
      synonyms: ['wire', 'cable', 'conductor'],
      conflicts: ['pipe', 'plumbing', 'water']
    },
    outlet: {
      synonyms: ['outlet', 'receptacle', 'socket'],
      conflicts: ['plumbing', 'water']
    },
    
    // Tools (generic)
    wrench: {
      synonyms: ['wrench', 'spanner', 'tool'],
      conflicts: []
    },
    screwdriver: {
      synonyms: ['screwdriver', 'driver', 'tool'],
      conflicts: []
    }
  };
  
  // Check for category-specific rules
  for (const [category, rules] of Object.entries(categoryRules)) {
    if (queryWords.includes(category)) {
      // Check conflicts first
      for (const conflict of rules.conflicts) {
        if (productLower.includes(conflict) && !queryLower.includes(conflict)) {
          return false;
        }
      }
      
      // Check if product matches any synonyms
      for (const synonym of rules.synonyms) {
        if (productLower.includes(synonym)) {
          return true;
        }
      }
    }
  }
  
  // Generic word matching for items not in specific categories
  let matchScore = 0;
  let totalWords = queryWords.length;
  
  for (const word of queryWords) {
    if (productLower.includes(word)) {
      matchScore++;
    }
    
    // Check for partial matches (for compound words)
    if (word.length > 4) {
      const partialMatch = word.substring(0, Math.floor(word.length * 0.7));
      if (productLower.includes(partialMatch)) {
        matchScore += 0.5;
      }
    }
  }
  
  // Require at least 50% of query words to match
  const matchThreshold = Math.max(1, totalWords * 0.5);
  return matchScore >= matchThreshold;
}

// Search Home Depot's actual product catalog
async function searchHomeDepotDirect(query: string): Promise<ProductResult | null> {
  try {
    console.log(`Searching Home Depot directly for: "${query}"`);
    
    // Use Home Depot's search API endpoint
    const searchUrl = `https://www.homedepot.com/s/${encodeURIComponent(query)}?NCNI-5`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.warn('Home Depot search failed:', response.status);
      return null;
    }
    
    const html = await response.text();
    
    // Parse Home Depot's search results  
    // Look for product tiles in their HTML structure
    const productPatterns = [
      // Primary pattern: extract from product pod structure with price in regex
      /<div[^>]*data-testid="product-pod"[^>]*>[\s\S]*?href="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?>\$([0-9,]+\.?[0-9]*)/,
      // Fallback pattern: find image and URL, then search for price separately using data-testid
      /<a[^>]*href="([^"]*\/p\/[^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/,
      // Flexible pattern for images with price in wider range  
      /<img[^>]*src="([^"]*(?:images\.homedepot-static\.com|hdstatic\.net)[^"]*)"[^>]*alt="([^"]*)"[\s\S]{0,2000}?\$([0-9,.]+)/,
      // Pattern to find image and then search for price separately
      /<img[^>]*src="([^"]*images\.homedepot-static\.com[^"]*)"[^>]*alt="([^"]*)"[^>]*>/,
      // Broadest pattern for any Home Depot images
      /<img[^>]*src="([^"]*(?:homedepot|hdstatic)[^"]*)"[^>]*alt="([^"]*)"[^>]*/i
    ];
    
    for (let i = 0; i < productPatterns.length; i++) {
      const pattern = productPatterns[i];
      if (!pattern) continue;
      const match = html.match(pattern);
      if (match) {
        let imageUrl, productName, productUrl, price;
        
        console.log(`Pattern ${i} matched with ${match.length} groups:`, match.slice(0, 5)); // Debug: show first 5 groups
        
        if (i === 0) { // primary pattern with price
          [, productUrl, imageUrl, productName, price] = match;
        } else if (i === 1) { // fallback pattern (no price in regex)
          [, productUrl, imageUrl, productName] = match;
        } else if (i === 2) { // flexible pricing pattern
          [, imageUrl, productName, price] = match;
          productUrl = searchUrl; // fallback to search URL
        } else if (i === 3) { // simplified pattern (no price in pattern)
          [, imageUrl, productName] = match;
          productUrl = searchUrl; // fallback to search URL
        } else if (i === 4) { // broad pattern (no price in pattern)
          [, imageUrl, productName] = match;
          productUrl = searchUrl; // fallback to search URL
        }
        
        console.log(`Extracted - Image: ${imageUrl?.substring(0, 50)}..., Name: ${productName}, Price: ${price}`);
        
        // Clean and validate image URL
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        }
        
        if (imageUrl && imageUrl.startsWith('http') && productName) {
          // Check if product name matches what we're looking for
          const isRelevant = isProductRelevant(query, productName);
          if (isRelevant) {
            console.log(`Found Home Depot product: "${productName}" (pattern ${i})`);
            
            // If no price found in the pattern, try to find it separately
            if (!price && (i === 1 || i === 3 || i === 4)) {
              console.log(`Searching for price separately for pattern ${i} and product: ${productName}`);
              
              // Look for price near the product name in the HTML
              const productNameIndex = html.indexOf(productName);
              console.log(`Product name found at index: ${productNameIndex}`);
              
              if (productNameIndex !== -1) {
                // Search for price within 2000 characters of the product name
                const searchStart = Math.max(0, productNameIndex - 1000);
                const searchEnd = Math.min(html.length, productNameIndex + 1000);
                const searchArea = html.substring(searchStart, searchEnd);
                
                console.log(`Searching in area of ${searchArea.length} characters for price patterns`);
                
                // Try multiple price patterns - prioritize Home Depot's data-testid format
                const pricePatterns = [
                  // Home Depot specific: data-testid="sticky-nav__price-value--{price}"
                  /data-testid="sticky-nav__price-value--([0-9]+\.?[0-9]*)"/,
                  // Basic dollar amount 
                  /\$([0-9]+\.?[0-9]*)/,
                  // Price with span/div tags
                  /<span[^>]*>\$([0-9]+\.?[0-9]*)<\/span>/,
                  /<div[^>]*>\$([0-9]+\.?[0-9]*)<\/div>/,
                  // Price data attributes
                  /data-price[^>]*="[^"]*\$([0-9]+\.?[0-9]*)"/,
                  /price[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/i,
                  // Common e-commerce price patterns
                  /"currentPrice"[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/,
                  /"price"[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/,
                  // More specific Home Depot patterns observed in successful extraction
                  /[\s>]\$([0-9]{1,4}\.?[0-9]{0,2})[\s<]/,
                  // Look for price in wider product context
                  /product[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/i
                ];
                
                for (let p = 0; p < pricePatterns.length; p++) {
                  const pricePattern = pricePatterns[p];
                  if (!pricePattern) continue;
                  const priceMatch = searchArea.match(pricePattern);
                  if (priceMatch && priceMatch[1]) {
                    price = priceMatch[1];
                    console.log(`Found price with pattern ${p}: $${price}`);
                    break;
                  }
                }
                
                // If still no price found, try searching the entire HTML for this specific product URL
                if (!price && productUrl) {
                  console.log(`Trying full HTML search for product URL: ${productUrl}`);
                  const urlIndex = html.indexOf(productUrl);
                  if (urlIndex !== -1) {
                    // Search around the product URL
                    const urlSearchStart = Math.max(0, urlIndex - 2000);
                    const urlSearchEnd = Math.min(html.length, urlIndex + 2000);
                    const urlSearchArea = html.substring(urlSearchStart, urlSearchEnd);
                    
                    // Use the same price patterns for URL area search
                    const urlPricePatterns = [
                      // Home Depot specific: data-testid="sticky-nav__price-value--{price}"
                      /data-testid="sticky-nav__price-value--([0-9]+\.?[0-9]*)"/,
                      // Basic dollar amount 
                      /\$([0-9]+\.?[0-9]*)/,
                      // Price with span/div tags
                      /<span[^>]*>\$([0-9]+\.?[0-9]*)<\/span>/,
                      /<div[^>]*>\$([0-9]+\.?[0-9]*)<\/div>/,
                      // Price data attributes
                      /data-price[^>]*="[^"]*\$([0-9]+\.?[0-9]*)"/,
                      /price[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/i
                    ];
                    
                    for (let p = 0; p < urlPricePatterns.length; p++) {
                      const pricePattern = urlPricePatterns[p];
                      if (!pricePattern) continue;
                      const priceMatch = urlSearchArea.match(pricePattern);
                      if (priceMatch && priceMatch[1]) {
                        price = priceMatch[1];
                        console.log(`Found price with URL area pattern ${p}: $${price}`);
                        break;
                      }
                    }
                  }
                }
                
                if (!price) {
                  console.log(`No price found with any pattern`);
                }
              }
            }
            
            return {
              name: productName.trim(),
              image_url: imageUrl,
              product_url: productUrl?.startsWith('http') ? productUrl : `https://www.homedepot.com${productUrl}`,
              price: price ? `$${price}` : 'Price not available',
              store: 'Home Depot'
            };
          } else {
            console.log(`Skipping irrelevant Home Depot product: "${productName}" for query "${query}" (pattern ${i})`);
          }
        }
      }
    }
    
    console.log(`No Home Depot products found for "${query}"`);
    return null;
  } catch (error) {
    console.warn('Home Depot search failed:', error);
    return null;
  }
}

// Search Lowe's actual product catalog
async function searchLowesDirect(query: string): Promise<ProductResult | null> {
  try {
    console.log(`Searching Lowe's directly for: "${query}"`);
    
    // Use Lowe's search endpoint
    const searchUrl = `https://www.lowes.com/search?searchTerm=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.warn('Lowe\'s search failed:', response.status);
      return null;
    }
    
    const html = await response.text();
    
    // Parse Lowe's search results
    const productPatterns = [
      // Lowe's product tile pattern
      /<div[^>]*class="[^"]*productTile[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<a[^>]*href="([^"]*)"[\s\S]*?\$([0-9,.]+)/,
      // Alternative Lowe's pattern
      /<a[^>]*href="([^"]*\/pd\/[^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?\$([0-9,.]+)/,
      // Simplified Lowe's image pattern
      /<img[^>]*src="([^"]*mobileimages\.lowes\.com[^"]*)"[^>]*alt="([^"]*)"[^>]*>/
    ];
    
    for (const pattern of productPatterns) {
      const match = html.match(pattern);
      if (match) {
        let imageUrl, productName, productUrl, price;
        
        if (pattern === productPatterns[0]) {
          [, imageUrl, productName, productUrl, price] = match;
        } else if (pattern === productPatterns[1]) {
          [, productUrl, imageUrl, productName, price] = match;
        } else {
          [, imageUrl, productName] = match;
          productUrl = searchUrl; // fallback to search URL
        }
        
        // Clean and validate image URL
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        }
        
        if (imageUrl && imageUrl.startsWith('http') && productName) {
          // Check if product name matches what we're looking for
          const isRelevant = isProductRelevant(query, productName);
          if (isRelevant) {
            console.log(`Found Lowe's product: "${productName}"`);
            return {
              name: productName.trim(),
              image_url: imageUrl,
              product_url: productUrl?.startsWith('http') ? productUrl : `https://www.lowes.com${productUrl}`,
              price: price ? `$${price}` : 'Price not available',
              store: "Lowe's"
            };
          } else {
            console.log(`Skipping irrelevant Lowe's product: "${productName}" for query "${query}"`);
          }
        }
      }
    }
    
    console.log(`No Lowe's products found for "${query}"`);
    return null;
  } catch (error) {
    console.warn('Lowe\'s search failed:', error);
    return null;
  }
}

// Fallback to general hardware-focused search
async function searchGeneralHardware(query: string): Promise<string | null> {
  try {
    // Make the search more specific based on the type of item
    const queryLower = query.toLowerCase();
    let searchTerms = 'hardware store product';
    
    if (queryLower.includes('electrical') || queryLower.includes('wire') || queryLower.includes('outlet')) {
      searchTerms = 'electrical hardware store product';
    } else if (queryLower.includes('plumbing') || queryLower.includes('pipe') || queryLower.includes('water')) {
      searchTerms = 'plumbing hardware store product';
    } else if (queryLower.includes('tool')) {
      searchTerms = 'tool hardware store product';
    } else if (queryLower.includes('paint') || queryLower.includes('primer')) {
      searchTerms = 'paint hardware store product';
    }
    
    const searchQuery = `"${query}" ${searchTerms}`;
    console.log(`Trying general hardware search for: "${searchQuery}"`);
    
    const response = await fetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}&form=HDRSC2&first=1&cw=1177&ch=745`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      }
    );
    
    if (!response.ok) {
      console.warn('General hardware search failed:', response.status);
      return null;
    }
    
    const html = await response.text();
    
    // Use the same patterns as retailer search
    const patterns = [
      /"murl":"([^"]+)"/,
      /"imgurl":"([^"]+)"/,
      /mediaurl=([^&]+)/,
      /imgurl=([^&]+)/,
      /src="([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)">/i
    ];
    
    for (const pattern of patterns) {
      const matches = html.match(new RegExp(pattern.source, 'g'));
      if (matches && matches.length > 0) {
        for (const match of matches.slice(0, 3)) {
          const urlMatch = match.match(pattern);
          if (urlMatch && urlMatch[1]) {
            let imageUrl = urlMatch[1];
            
            if (imageUrl.includes('%')) {
              try {
                imageUrl = decodeURIComponent(imageUrl);
              } catch (e) {
                continue;
              }
            }
            
            // Validate and filter
            if (imageUrl.startsWith('http') && (imageUrl.includes('.jpg') || imageUrl.includes('.png') || imageUrl.includes('.jpeg') || imageUrl.includes('.webp'))) {
              const irrelevantTerms = ['flower', 'plant', 'garden', 'outdoor', 'patio', 'lawn', 'furniture', 'decor', 'kitchen', 'bathroom'];
              const isIrrelevant = irrelevantTerms.some(term => 
                imageUrl.toLowerCase().includes(term) && !query.toLowerCase().includes(term)
              );
              
              if (!isIrrelevant) {
                console.log(`Found general hardware image for "${query}":`, imageUrl);
                return imageUrl;
              }
            }
          }
        }
      }
    }
    
    console.log(`No general hardware image found for "${query}"`);
    return null;
  } catch (error) {
    console.warn('General hardware search failed:', error);
    return null;
  }
}

// Enhanced product search with direct store access
async function getProductInfo(itemName: string): Promise<{image_url: string | null, product_url?: string, store_name?: string}> {
  console.log(`Getting product info for: "${itemName}"`);
  
  // Make search query more specific for certain items
  let searchQuery = itemName;
  const itemLower = itemName.toLowerCase();
  
  // Category-specific search enhancements
  const searchEnhancements: Record<string, string> = {
    // Painting & Wall Repair
    'paint': 'latex acrylic wall interior exterior',
    'primer': 'wall primer sealer undercoat bonding',
    'spackling': 'wall repair compound filler patch',
    'sandpaper': 'sanding abrasive grit paper sheets',
    'caulk': 'sealant silicone bathroom kitchen acrylic',
    'caulking': 'sealant silicone bathroom kitchen acrylic',
    'putty knife': 'scraper tool wall drywall',
    'roller': 'paint roller cover nap sleeve',
    'brush': 'paint brush synthetic natural bristle',
    'tray': 'paint tray liner plastic metal',
    'tape': 'painters tape masking blue green',
    'drop cloth': 'plastic canvas protection painting',
    'stain': 'wood stain deck fence outdoor',
    'varnish': 'polyurethane clear coat finish',
    'sealer': 'wood concrete masonry sealer',
    'texture': 'wall texture spray knockdown orange peel',
    
    // Drywall & Plastering
    'drywall': 'sheetrock gypsum board panels',
    'sheetrock': 'drywall gypsum board panels',
    'joint compound': 'drywall mud spackling compound',
    'mesh tape': 'drywall fiberglass self adhesive',
    'paper tape': 'drywall joint compound seaming',
    'corner bead': 'drywall metal plastic bullnose',
    'plaster': 'wall repair venetian lime',
    
    // Plumbing
    'pipe': 'plumbing water supply PVC copper',
    'fitting': 'plumbing connector coupling elbow tee',
    'valve': 'plumbing water shut off ball gate',
    'faucet': 'kitchen bathroom sink spout handle',
    'toilet': 'bathroom toilet commode lavatory water closet one-piece two-piece elongated round front',
    'sink': 'kitchen bathroom undermount drop-in',
    'drain': 'plumbing sink tub shower floor',
    'trap': 'plumbing P-trap S-trap drainage',
    'supply line': 'water supply braided flexible',
    'shutoff valve': 'water supply angle straight',
    'flapper': 'toilet tank flush valve rubber chain',
    'wax ring': 'toilet seal gasket installation floor',
    'toilet flange': 'closet flange PVC cast iron floor pipe',
    'toilet bolts': 'closet bolts floor flange brass stainless',
    'toilet tank': 'toilet reservoir water flush mechanism',
    'toilet seat': 'toilet seat cover round elongated soft close',
    'fill valve': 'toilet tank water inlet ballcock',
    'flush valve': 'toilet tank drain seal gasket',
    'toilet chain': 'toilet flapper lift chain rubber',
    'toilet handle': 'toilet flush lever chrome brushed nickel',
    'toilet supply line': 'toilet water braided flexible connector',
    'pipe wrench': 'plumbing tool adjustable heavy duty',
    'plunger': 'toilet sink drain plumbing tool',
    'snake': 'drain auger cable plumbing tool',
    'pipe cleaner': 'drain opener chemical liquid',
    'water heater': 'tank tankless gas electric',
    'garbage disposal': 'kitchen sink food waste',
    'bathtub': 'bathroom tub soaking alcove freestanding',
    'shower': 'bathroom enclosure door head valve',
    'vanity': 'bathroom cabinet sink mirror storage',
    'medicine cabinet': 'bathroom mirror storage recessed',
    'towel bar': 'bathroom hardware chrome brushed nickel',
    'toilet paper holder': 'bathroom hardware wall mount',
    'bidet': 'bathroom fixture hygiene washlet',
    'urinal': 'bathroom commercial fixture wall mount',
    'laundry tub': 'utility sink basement garage',
    'sump pump': 'basement water removal drainage submersible',
    'well pump': 'water system jet submersible pressure',
    'water filter': 'whole house under sink reverse osmosis',
    'water softener': 'salt ion exchange resin tank',
    'septic tank': 'wastewater treatment system concrete',
    
    // Appliances & HVAC
    'furnace': 'heating system gas oil electric forced air',
    'air conditioner': 'cooling system central window split',
    'heat pump': 'HVAC heating cooling electric system',
    'boiler': 'heating system hot water steam gas oil',
    'ductwork': 'HVAC galvanized flexible insulated round',
    'vent': 'exhaust bathroom kitchen roof wall',
    'humidifier': 'HVAC whole house portable steam',
    'dehumidifier': 'basement moisture control portable',
    'air purifier': 'HEPA filter indoor air quality',
    'range hood': 'kitchen exhaust fan ventilation',
    'dishwasher': 'kitchen appliance built-in portable',
    'refrigerator': 'kitchen appliance stainless steel french door',
    'stove': 'kitchen range cooktop gas electric induction',
    'oven': 'kitchen appliance wall mount convection',
    'microwave': 'kitchen appliance countertop over range',
    'washer': 'laundry appliance front load top load',
    'dryer': 'laundry appliance gas electric ventless',
    
    // Electrical
    'wire': 'electrical cable conductor THHN Romex',
    'outlet': 'electrical receptacle GFCI wall duplex',
    'switch': 'electrical wall toggle dimmer GFCI',
    'breaker': 'electrical panel circuit protection',
    'conduit': 'electrical raceway PVC metal EMT',
    'junction box': 'electrical outlet switch ceiling',
    'wire nuts': 'electrical connectors twist caps',
    'electrical tape': 'insulation vinyl black',
    'multimeter': 'electrical testing voltage ohm',
    'voltage tester': 'electrical safety non-contact',
    'fish tape': 'electrical wire pulling snake',
    'cable staples': 'electrical wire securing fastener',
    'panel': 'electrical breaker main sub',
    'GFCI': 'ground fault outlet receptacle',
    'light fixture': 'ceiling wall pendant chandelier',
    'ceiling fan': 'electrical cooling air circulation',
    'thermostat': 'HVAC heating cooling programmable',
    
    // HVAC & Insulation
    'furnace filter': 'HVAC air filter pleated fiberglass',
    'air duct': 'HVAC air conditioning heating metal ductwork',
    'air vent': 'HVAC air register grille return supply',
    'insulation': 'fiberglass foam blown cellulose',
    'weatherstripping': 'door window seal draft',
    'caulking gun': 'sealant applicator tool manual',
    
    // Tools - Hand Tools
    'wrench': 'tool adjustable combination box end',
    'screwdriver': 'tool driver phillips flathead torx',
    'drill': 'power tool cordless corded driver',
    'saw': 'cutting tool circular miter jigsaw',
    'hammer': 'tool construction framing claw',
    'level': 'tool spirit bubble laser magnetic',
    'tape measure': 'measuring tool construction 25ft',
    'utility knife': 'box cutter razor blade retractable',
    'pliers': 'tool needle nose lineman cutting',
    'socket set': 'tool ratchet metric SAE',
    'allen wrench': 'hex key set metric SAE',
    'chisel': 'wood working tool sharp blade',
    'file': 'tool metal wood shaping smoothing',
    'rasp': 'tool wood shaping coarse file',
    'clamp': 'tool woodworking bar pipe spring',
    'vise': 'tool bench workbench clamping',
    'crowbar': 'pry bar wrecking tool demolition',
    'sledgehammer': 'demolition tool heavy duty',
    
    // Power Tools
    'circular saw': 'power tool cutting wood blade',
    'miter saw': 'power tool crosscut chop saw',
    'jigsaw': 'power tool curved cutting blade',
    'reciprocating saw': 'demolition cutting tool sawzall',
    'angle grinder': 'power tool cutting grinding disc',
    'router': 'woodworking tool trim edge profiling',
    'sander': 'power tool orbital belt detail',
    'nail gun': 'pneumatic nailer brad finish framing',
    'compressor': 'air tool pneumatic tank portable',
    
    // Hardware & Fasteners
    'screw': 'fastener hardware wood metal deck',
    'nail': 'fastener construction framing finishing',
    'bolt': 'fastener hardware carriage hex lag',
    'flat washer': 'hardware fastener flat lock spring steel',
    'nut': 'fastener hardware hex wing cap',
    'anchor': 'wall fastener toggle molly drywall',
    'hinge': 'door cabinet hardware butt piano',
    'latch': 'door cabinet hardware magnetic ball',
    'handle': 'door cabinet drawer pull knob',
    'lock': 'door deadbolt knob security',
    'chain': 'hardware galvanized stainless steel',
    'rope': 'utility nylon manila polypropylene',
    'cable': 'steel wire aircraft galvanized',
    'turnbuckle': 'hardware tensioning adjustment',
    
    // Flooring
    'tile': 'flooring ceramic porcelain stone vinyl',
    'grout': 'tile flooring sanded unsanded epoxy',
    'underlayment': 'flooring subfloor preparation foam',
    'laminate': 'flooring wood-look click lock',
    'hardwood': 'flooring solid engineered oak',
    'vinyl': 'flooring LVT plank luxury waterproof',
    'carpet': 'flooring residential commercial padding',
    'transition strip': 'flooring threshold reducer',
    'quarter round': 'trim molding baseboard flooring',
    'tile spacers': 'flooring installation alignment',
    'trowel': 'flooring tool adhesive spreading',
    'float': 'tile tool grouting smoothing',
    'knee pads': 'flooring protection comfort',
    
    // Roofing
    'shingle': 'roofing asphalt architectural 3-tab',
    'flashing': 'roofing waterproof metal aluminum',
    'gutter': 'roofing drainage aluminum vinyl',
    'downspout': 'gutter drainage water management',
    'roof cement': 'sealant repair waterproof black',
    'ice dam': 'roofing prevention membrane protection',
    'ridge vent': 'roofing ventilation air flow',
    'soffit': 'roofing ventilation aluminum vinyl',
    'fascia': 'roofing trim board aluminum wood',
    'drip edge': 'roofing metal flashing protection',
    
    // Concrete & Masonry
    'concrete': 'cement mix ready sand aggregate',
    'mortar': 'masonry brick block pointing',
    'concrete grout': 'concrete crack filler repair',
    'rebar': 'concrete reinforcement steel rod',
    'mesh': 'concrete reinforcement wire welded',
    'concrete sealer': 'concrete driveway waterproof acrylic',
    'brick': 'masonry clay fire building material',
    'block': 'concrete masonry CMU cinder',
    'stone': 'natural fieldstone flagstone veneer',
    'pavers': 'concrete brick patio walkway',
    
    // Lumber & Building Materials
    'lumber': 'wood framing construction 2x4 2x6',
    'plywood': 'sheet material OSB construction grade',
    'OSB': 'oriented strand board sheathing',
    
    // Windows & Doors - Comprehensive
    'window': 'vinyl wood aluminum double hung casement sliding',
    'door': 'entry interior exterior steel fiberglass wood',
    'window frame': 'vinyl wood aluminum replacement new construction',
    'door frame': 'jamb casing trim wood metal pre-hung',
    'window glass': 'double pane single pane tempered low-E',
    'window screen': 'fiberglass aluminum pet mesh replacement',
    'storm door': 'aluminum full view glass self storing',
    'screen door': 'aluminum wood fiberglass security mesh',
    'sliding door': 'patio door vinyl aluminum wood frame',
    'french door': 'interior exterior glass panel swing',
    'pocket door': 'sliding interior space saving hardware',
    'bifold door': 'closet pantry folding accordion',
    'barn door': 'sliding track hardware rustic modern',
    'door knob': 'entry interior privacy passage lever',
    'door handle': 'lever grip pull bar commercial',
    'deadbolt': 'door lock security single double cylinder',
    'door hinge': 'butt piano continuous heavy duty',
    'door closer': 'commercial spring hydraulic adjustment',
    'window lock': 'sash lock casement sliding security',
    'window crank': 'casement window operator handle replacement',
    'door sweep': 'weatherstrip seal draft bottom threshold',
    'door threshold': 'aluminum wood vinyl adjustable',
    'weatherstrip': 'door window foam rubber vinyl seal',
    'caulk gun': 'sealant applicator manual pneumatic',
    
    // Structural & Framing - Comprehensive
    'beam': 'structural support steel wood laminated I-beam',
    'joist': 'floor ceiling support lumber engineered I-joist',
    'rafter': 'roof framing lumber engineered truss',
    'stud': 'wall framing 2x4 2x6 metal wood',
    'plate': 'top bottom sole wall framing lumber',
    'header': 'window door beam support structural',
    'post': 'support column 4x4 6x6 steel adjustable',
    'pier': 'foundation concrete block adjustable jack',
    'footing': 'concrete foundation base spread strip',
    'foundation': 'concrete block stone basement crawl space',
    'sill plate': 'foundation wall lumber pressure treated',
    'subfloor': 'plywood OSB tongue groove engineered',
    'vapor barrier': 'plastic sheeting moisture control',
    'house wrap': 'weather barrier Tyvek building wrap',
    'sheathing': 'wall roof OSB plywood structural',
    
    // Exterior & Siding - Comprehensive
    'siding': 'vinyl wood fiber cement aluminum lap',
    'stucco': 'exterior wall finish cement plaster synthetic',
    'stone veneer': 'cultured natural fieldstone ledge',
    'deck board': 'composite pressure treated cedar redwood',
    'deck joist': '2x8 2x10 pressure treated lumber',
    'deck beam': 'pressure treated lumber 2x10 2x12',
    'deck post': '4x4 6x6 pressure treated composite',
    'deck railing': 'aluminum wood composite vinyl glass',
    'deck stairs': 'pressure treated lumber composite stringers',
    'fence post': '4x4 6x6 pressure treated cedar vinyl',
    'fence panel': 'privacy picket lattice wood vinyl',
    'fence gate': 'wood vinyl aluminum hardware latch',
    'mailbox': 'residential post mount wall mount decorative',
    'driveway': 'concrete asphalt gravel paver brick',
    'walkway': 'concrete flagstone brick paver stepping stone',
    'patio': 'concrete flagstone brick paver stamped',
    'retaining wall': 'block stone timber concrete segmental',
    'landscape edging': 'plastic metal stone concrete brick',
    'mulch': 'wood bark rubber stone decorative',
    'gravel': 'pea stone crushed river rock drainage',
    
    // Kitchen & Bathroom - Comprehensive  
    'cabinet': 'kitchen bathroom vanity wall base tall',
    'cabinet door': 'kitchen bathroom replacement overlay inset',
    'cabinet hardware': 'knob pull handle hinge soft close',
    'countertop': 'granite quartz laminate butcher block concrete',
    'backsplash': 'tile stone glass ceramic subway mosaic',
    'kitchen island': 'cabinet base counter seating storage',
    'pantry': 'cabinet tall storage kitchen organization',
    'mirror': 'bathroom vanity wall frameless framed LED',
    'shower door': 'glass frameless semi-frameless sliding pivot',
    'shower pan': 'fiberglass acrylic tile ready base',
    'shower valve': 'mixing thermostatic pressure balance',
    'tub surround': 'fiberglass acrylic tile wall panel',
    'bathroom fan': 'exhaust ventilation ceiling wall humidity',
    'towel rack': 'bathroom hardware chrome brushed nickel',
    'grab bar': 'bathroom safety ADA compliant stainless',
    'toilet paper dispenser': 'commercial residential wall mount',
    
    // Specialty Systems - Comprehensive
    'security system': 'alarm panel keypad sensor camera',
    'smoke detector': 'battery hardwired photoelectric ionization',
    'carbon monoxide detector': 'battery plug-in combination',
    'fire extinguisher': 'ABC dry chemical kitchen home',
    'circuit breaker': 'electrical panel AFCI GFCI protection',
    'electrical panel': 'main service sub load center',
    'generator': 'portable standby whole house backup power',
    'pressure tank': 'well water bladder diaphragm steel',
    'water treatment': 'softener filter reverse osmosis UV',
    'septic system': 'tank pump aerobic conventional alternative',
    'french drain': 'drainage perforated pipe gravel fabric',
    'gutter guard': 'leaf protection mesh screen foam',
    'chimney cap': 'stainless steel copper spark arrestor',
    'chimney liner': 'stainless steel flexible rigid clay',
    'attic fan': 'exhaust ventilation ridge gable solar',
    'whole house fan': 'attic cooling ventilation energy saving',
    
    // Cleaning & Maintenance - Comprehensive
    'shop vacuum': 'wet dry vac industrial commercial',
    'pressure washer': 'electric gas cleaning concrete deck',
    'leaf blower': 'electric gas cordless yard maintenance',
    'lawn mower': 'walk behind riding zero turn electric',
    'weed trimmer': 'string trimmer edger gas electric',
    'hedge trimmer': 'electric gas cordless pruning shears',
    'chain saw': 'gas electric cordless tree cutting',
    'snow blower': 'electric gas two stage single stage',
    'salt spreader': 'ice melt broadcast drop winter',
    'gutter cleaner': 'scoop tool extension wand pressure',
    'drain snake': 'auger cable toilet sink floor drain',
    'toilet auger': 'closet auger snake plumbing tool',
    'pipe snake': 'drain cleaning cable electric manual',
    
    // Smart Home & Technology - Comprehensive  
    'smart thermostat': 'programmable WiFi learning touchscreen',
    'smart doorbell': 'video camera WiFi motion detection',
    'smart lock': 'keypad biometric WiFi deadbolt lever',
    'smart switch': 'WiFi dimmer motion sensor voice control',
    'smart outlet': 'WiFi USB GFCI timer voice control',
    'security camera': 'wireless wired outdoor indoor night vision',
    'motion sensor': 'security lighting PIR wireless wired',
    'door sensor': 'security alarm magnetic wireless contact',
    'window sensor': 'security alarm magnetic wireless vibration',
    'smart garage opener': 'WiFi belt chain screw drive',
    'smart sprinkler': 'WiFi timer zone control rain sensor',
    'smart water monitor': 'leak detection shut off valve',
    
    // Storage & Organization - Comprehensive
    'shelving': 'wire steel wood plastic garage utility',
    'storage cabinet': 'garage utility plastic steel resin',
    'pegboard': 'tool storage organization hooks accessories',
    'tool chest': 'rolling cabinet drawer organizer mechanic',
    'workbench': 'garage workshop steel wood adjustable',
    'garage storage': 'ceiling overhead wall mount system',
    'closet organizer': 'wire shelf rod system walk-in reach-in',
    'pantry organizer': 'shelf basket pull-out lazy susan',
    'laundry organizer': 'shelf cabinet iroring board storage'
  };
  
  // Find the best enhancement for this item - prioritize longer, more specific matches first
  const sortedEnhancements = Object.entries(searchEnhancements)
    .sort(([a], [b]) => b.length - a.length); // Sort by keyword length descending
    
  for (const [keyword, enhancement] of sortedEnhancements) {
    if (itemLower.includes(keyword)) {
      searchQuery = `${itemName} ${enhancement}`;
      break;
    }
  }
  
  console.log(`Using search query: "${searchQuery}"`);
  
  // Try Home Depot direct search first
  const homeDepotProduct = await searchHomeDepotDirect(searchQuery);
  if (homeDepotProduct) {
    console.log(`Found Home Depot product for "${itemName}":`, homeDepotProduct);
    return {
      image_url: homeDepotProduct.image_url,
      product_url: homeDepotProduct.product_url,
      store_name: homeDepotProduct.store
    };
  }
  
  // Try Lowe's direct search
  const lowesProduct = await searchLowesDirect(searchQuery);
  if (lowesProduct) {
    console.log(`Found Lowe's product for "${itemName}":`, lowesProduct);
    return {
      image_url: lowesProduct.image_url,
      product_url: lowesProduct.product_url,
      store_name: lowesProduct.store
    };
  }
  
  // Try general hardware search as fallback
  const hardwareImage = await searchGeneralHardware(itemName);
  if (hardwareImage) {
    console.log(`Using hardware image for "${itemName}":`, hardwareImage);
    return { image_url: hardwareImage };
  }
  
  console.log(`No product found for "${itemName}", using fallback`);
  
  // Fallback to known working images for common items
  const staticImages: Record<string, string> = {
    // Painting & Wall Repair
    'putty knife': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'spackling compound': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400', 
    'paint roller': 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400',
    'paint brush': 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400',
    'sandpaper': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'sanding block': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'primer': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400',
    'paint': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400',
    'caulk': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    
    // Tools
    'wrench': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'screwdriver': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'drill': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'hammer': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'saw': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    
    // Plumbing
    'pipe': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'fitting': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'valve': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'faucet': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    
    // Electrical
    'wire': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'outlet': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'switch': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'breaker': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    
    // Hardware
    'screw': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'nail': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'bolt': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    
    // Generic tools/hardware fallback
    'tool': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
    'hardware': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400'
  };
  
  const searchName = itemName.toLowerCase();
  
  // Try exact match
  if (staticImages[searchName]) {
    console.log(`Using static image for "${itemName}"`);
    return { image_url: staticImages[searchName] };
  }
  
  // Try partial matches
  for (const [key, imageUrl] of Object.entries(staticImages)) {
    if (searchName.includes(key) || key.includes(searchName)) {
      console.log(`Using partial match static image for "${itemName}" (matched "${key}")`);
      return { image_url: imageUrl };
    }
  }
  
  console.log(`No image found for "${itemName}"`);
  return { image_url: null };
}

export async function addProductImages(analysisResult: any): Promise<any> {
  // Add product info to materials
  if (analysisResult.materials) {
    const materialsWithProducts = await Promise.all(
      analysisResult.materials.map(async (material: any) => {
        const productInfo = await getProductInfo(material.name);
        return {
          ...material,
          image_url: productInfo.image_url,
          product_url: productInfo.product_url,
          store_name: productInfo.store_name
        };
      })
    );
    analysisResult.materials = materialsWithProducts;
  }

  // Add product info to tools
  if (analysisResult.tools) {
    const toolsWithProducts = await Promise.all(
      analysisResult.tools.map(async (tool: any) => {
        const productInfo = await getProductInfo(tool.name);
        return {
          ...tool,
          image_url: productInfo.image_url,
          product_url: productInfo.product_url,
          store_name: productInfo.store_name
        };
      })
    );
    analysisResult.tools = toolsWithProducts;
  }

  return analysisResult;
}
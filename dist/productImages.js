"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addProductImages = addProductImages;
function isProductRelevant(query, productName) {
    const queryLower = query.toLowerCase();
    const productLower = productName.toLowerCase();
    const commonWords = ['for', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'inch', 'ft', 'foot', 'yard', 'pack', 'set'];
    const queryWords = queryLower.split(/[\s\-_]+/).filter(word => word.length > 2 && !commonWords.includes(word));
    const categoryRules = {
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
        pipe: {
            synonyms: ['pipe', 'tubing', 'conduit'],
            conflicts: ['electrical', 'wire', 'cable']
        },
        fitting: {
            synonyms: ['fitting', 'connector', 'coupling', 'elbow', 'tee'],
            conflicts: ['electrical', 'wire']
        },
        wire: {
            synonyms: ['wire', 'cable', 'conductor'],
            conflicts: ['pipe', 'plumbing', 'water']
        },
        outlet: {
            synonyms: ['outlet', 'receptacle', 'socket'],
            conflicts: ['plumbing', 'water']
        },
        wrench: {
            synonyms: ['wrench', 'spanner', 'tool'],
            conflicts: []
        },
        screwdriver: {
            synonyms: ['screwdriver', 'driver', 'tool'],
            conflicts: []
        }
    };
    for (const [category, rules] of Object.entries(categoryRules)) {
        if (queryWords.includes(category)) {
            for (const conflict of rules.conflicts) {
                if (productLower.includes(conflict) && !queryLower.includes(conflict)) {
                    return false;
                }
            }
            for (const synonym of rules.synonyms) {
                if (productLower.includes(synonym)) {
                    return true;
                }
            }
        }
    }
    let matchScore = 0;
    let totalWords = queryWords.length;
    for (const word of queryWords) {
        if (productLower.includes(word)) {
            matchScore++;
        }
        if (word.length > 4) {
            const partialMatch = word.substring(0, Math.floor(word.length * 0.7));
            if (productLower.includes(partialMatch)) {
                matchScore += 0.5;
            }
        }
    }
    const matchThreshold = Math.max(1, totalWords * 0.5);
    return matchScore >= matchThreshold;
}
async function searchHomeDepotDirect(query) {
    try {
        console.log(`Searching Home Depot directly for: "${query}"`);
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
        const productPatterns = [
            /<div[^>]*data-testid="product-pod"[^>]*>[\s\S]*?href="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?>\$([0-9,]+\.?[0-9]*)/,
            /<a[^>]*href="([^"]*\/p\/[^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/,
            /<img[^>]*src="([^"]*(?:images\.homedepot-static\.com|hdstatic\.net)[^"]*)"[^>]*alt="([^"]*)"[\s\S]{0,2000}?\$([0-9,.]+)/,
            /<img[^>]*src="([^"]*images\.homedepot-static\.com[^"]*)"[^>]*alt="([^"]*)"[^>]*>/,
            /<img[^>]*src="([^"]*(?:homedepot|hdstatic)[^"]*)"[^>]*alt="([^"]*)"[^>]*/i
        ];
        for (let i = 0; i < productPatterns.length; i++) {
            const pattern = productPatterns[i];
            if (!pattern)
                continue;
            const match = html.match(pattern);
            if (match) {
                let imageUrl, productName, productUrl, price;
                console.log(`Pattern ${i} matched with ${match.length} groups:`, match.slice(0, 5));
                if (i === 0) {
                    [, productUrl, imageUrl, productName, price] = match;
                }
                else if (i === 1) {
                    [, productUrl, imageUrl, productName] = match;
                }
                else if (i === 2) {
                    [, imageUrl, productName, price] = match;
                    productUrl = searchUrl;
                }
                else if (i === 3) {
                    [, imageUrl, productName] = match;
                    productUrl = searchUrl;
                }
                else if (i === 4) {
                    [, imageUrl, productName] = match;
                    productUrl = searchUrl;
                }
                console.log(`Extracted - Image: ${imageUrl?.substring(0, 50)}..., Name: ${productName}, Price: ${price}`);
                if (imageUrl && imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                }
                if (imageUrl && imageUrl.startsWith('http') && productName) {
                    const isRelevant = isProductRelevant(query, productName);
                    if (isRelevant) {
                        console.log(`Found Home Depot product: "${productName}" (pattern ${i})`);
                        if (!price && (i === 1 || i === 3 || i === 4)) {
                            console.log(`Searching for price separately for pattern ${i} and product: ${productName}`);
                            const productNameIndex = html.indexOf(productName);
                            console.log(`Product name found at index: ${productNameIndex}`);
                            if (productNameIndex !== -1) {
                                const searchStart = Math.max(0, productNameIndex - 1000);
                                const searchEnd = Math.min(html.length, productNameIndex + 1000);
                                const searchArea = html.substring(searchStart, searchEnd);
                                console.log(`Searching in area of ${searchArea.length} characters for price patterns`);
                                const pricePatterns = [
                                    /data-testid="sticky-nav__price-value--([0-9]+\.?[0-9]*)"/,
                                    /\$([0-9]+\.?[0-9]*)/,
                                    /<span[^>]*>\$([0-9]+\.?[0-9]*)<\/span>/,
                                    /<div[^>]*>\$([0-9]+\.?[0-9]*)<\/div>/,
                                    /data-price[^>]*="[^"]*\$([0-9]+\.?[0-9]*)"/,
                                    /price[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/i,
                                    /"currentPrice"[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/,
                                    /"price"[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/,
                                    /[\s>]\$([0-9]{1,4}\.?[0-9]{0,2})[\s<]/,
                                    /product[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/i
                                ];
                                for (let p = 0; p < pricePatterns.length; p++) {
                                    const pricePattern = pricePatterns[p];
                                    if (!pricePattern)
                                        continue;
                                    const priceMatch = searchArea.match(pricePattern);
                                    if (priceMatch && priceMatch[1]) {
                                        price = priceMatch[1];
                                        console.log(`Found price with pattern ${p}: $${price}`);
                                        break;
                                    }
                                }
                                if (!price && productUrl) {
                                    console.log(`Trying full HTML search for product URL: ${productUrl}`);
                                    const urlIndex = html.indexOf(productUrl);
                                    if (urlIndex !== -1) {
                                        const urlSearchStart = Math.max(0, urlIndex - 2000);
                                        const urlSearchEnd = Math.min(html.length, urlIndex + 2000);
                                        const urlSearchArea = html.substring(urlSearchStart, urlSearchEnd);
                                        const urlPricePatterns = [
                                            /data-testid="sticky-nav__price-value--([0-9]+\.?[0-9]*)"/,
                                            /\$([0-9]+\.?[0-9]*)/,
                                            /<span[^>]*>\$([0-9]+\.?[0-9]*)<\/span>/,
                                            /<div[^>]*>\$([0-9]+\.?[0-9]*)<\/div>/,
                                            /data-price[^>]*="[^"]*\$([0-9]+\.?[0-9]*)"/,
                                            /price[^>]*>[^$]*\$([0-9]+\.?[0-9]*)/i
                                        ];
                                        for (let p = 0; p < urlPricePatterns.length; p++) {
                                            const pricePattern = urlPricePatterns[p];
                                            if (!pricePattern)
                                                continue;
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
                    }
                    else {
                        console.log(`Skipping irrelevant Home Depot product: "${productName}" for query "${query}" (pattern ${i})`);
                    }
                }
            }
        }
        console.log(`No Home Depot products found for "${query}"`);
        return null;
    }
    catch (error) {
        console.warn('Home Depot search failed:', error);
        return null;
    }
}
async function searchLowesDirect(query) {
    try {
        console.log(`Searching Lowe's directly for: "${query}"`);
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
        const productPatterns = [
            /<div[^>]*class="[^"]*productTile[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<a[^>]*href="([^"]*)"[\s\S]*?\$([0-9,.]+)/,
            /<a[^>]*href="([^"]*\/pd\/[^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?\$([0-9,.]+)/,
            /<img[^>]*src="([^"]*mobileimages\.lowes\.com[^"]*)"[^>]*alt="([^"]*)"[^>]*>/
        ];
        for (const pattern of productPatterns) {
            const match = html.match(pattern);
            if (match) {
                let imageUrl, productName, productUrl, price;
                if (pattern === productPatterns[0]) {
                    [, imageUrl, productName, productUrl, price] = match;
                }
                else if (pattern === productPatterns[1]) {
                    [, productUrl, imageUrl, productName, price] = match;
                }
                else {
                    [, imageUrl, productName] = match;
                    productUrl = searchUrl;
                }
                if (imageUrl && imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                }
                if (imageUrl && imageUrl.startsWith('http') && productName) {
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
                    }
                    else {
                        console.log(`Skipping irrelevant Lowe's product: "${productName}" for query "${query}"`);
                    }
                }
            }
        }
        console.log(`No Lowe's products found for "${query}"`);
        return null;
    }
    catch (error) {
        console.warn('Lowe\'s search failed:', error);
        return null;
    }
}
async function searchGeneralHardware(query) {
    try {
        const queryLower = query.toLowerCase();
        let searchTerms = 'hardware store product';
        if (queryLower.includes('electrical') || queryLower.includes('wire') || queryLower.includes('outlet')) {
            searchTerms = 'electrical hardware store product';
        }
        else if (queryLower.includes('plumbing') || queryLower.includes('pipe') || queryLower.includes('water')) {
            searchTerms = 'plumbing hardware store product';
        }
        else if (queryLower.includes('tool')) {
            searchTerms = 'tool hardware store product';
        }
        else if (queryLower.includes('paint') || queryLower.includes('primer')) {
            searchTerms = 'paint hardware store product';
        }
        const searchQuery = `"${query}" ${searchTerms}`;
        console.log(`Trying general hardware search for: "${searchQuery}"`);
        const response = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}&form=HDRSC2&first=1&cw=1177&ch=745`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        if (!response.ok) {
            console.warn('General hardware search failed:', response.status);
            return null;
        }
        const html = await response.text();
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
                            }
                            catch (e) {
                                continue;
                            }
                        }
                        if (imageUrl.startsWith('http') && (imageUrl.includes('.jpg') || imageUrl.includes('.png') || imageUrl.includes('.jpeg') || imageUrl.includes('.webp'))) {
                            const irrelevantTerms = ['flower', 'plant', 'garden', 'outdoor', 'patio', 'lawn', 'furniture', 'decor', 'kitchen', 'bathroom'];
                            const isIrrelevant = irrelevantTerms.some(term => imageUrl.toLowerCase().includes(term) && !query.toLowerCase().includes(term));
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
    }
    catch (error) {
        console.warn('General hardware search failed:', error);
        return null;
    }
}
async function getProductInfo(itemName) {
    console.log(`Getting product info for: "${itemName}"`);
    let searchQuery = itemName;
    const itemLower = itemName.toLowerCase();
    const searchEnhancements = {
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
        'drywall': 'sheetrock gypsum board panels',
        'sheetrock': 'drywall gypsum board panels',
        'joint compound': 'drywall mud spackling compound',
        'mesh tape': 'drywall fiberglass self adhesive',
        'paper tape': 'drywall joint compound seaming',
        'corner bead': 'drywall metal plastic bullnose',
        'plaster': 'wall repair venetian lime',
        'pipe': 'plumbing water supply PVC copper',
        'fitting': 'plumbing connector coupling elbow tee',
        'valve': 'plumbing water shut off ball gate',
        'faucet': 'kitchen bathroom sink spout handle',
        'toilet': 'bathroom plumbing fixture commode',
        'sink': 'kitchen bathroom undermount drop-in',
        'drain': 'plumbing sink tub shower floor',
        'trap': 'plumbing P-trap S-trap drainage',
        'supply line': 'water supply braided flexible',
        'shutoff valve': 'water supply angle straight',
        'flapper': 'toilet tank flush valve rubber',
        'wax ring': 'toilet seal gasket installation',
        'pipe wrench': 'plumbing tool adjustable heavy duty',
        'plunger': 'toilet sink drain plumbing tool',
        'snake': 'drain auger cable plumbing tool',
        'pipe cleaner': 'drain opener chemical liquid',
        'water heater': 'tank tankless gas electric',
        'sump pump': 'basement water removal drainage',
        'garbage disposal': 'kitchen sink food waste',
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
        'furnace filter': 'HVAC air filter pleated fiberglass',
        'ductwork': 'HVAC air conditioning heating metal',
        'vent': 'HVAC air register grille return',
        'insulation': 'fiberglass foam blown cellulose',
        'weatherstripping': 'door window seal draft',
        'caulking gun': 'sealant applicator tool manual',
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
        'circular saw': 'power tool cutting wood blade',
        'miter saw': 'power tool crosscut chop saw',
        'jigsaw': 'power tool curved cutting blade',
        'reciprocating saw': 'demolition cutting tool sawzall',
        'angle grinder': 'power tool cutting grinding disc',
        'router': 'woodworking tool trim edge profiling',
        'sander': 'power tool orbital belt detail',
        'nail gun': 'pneumatic nailer brad finish framing',
        'compressor': 'air tool pneumatic tank portable',
        'screw': 'fastener hardware wood metal deck',
        'nail': 'fastener construction framing finishing',
        'bolt': 'fastener hardware carriage hex lag',
        'washer': 'hardware fastener flat lock spring',
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
        'lumber': 'wood framing construction 2x4 2x6',
        'plywood': 'sheet material OSB construction grade',
        'OSB': 'oriented strand board sheathing',
        'beam': 'structural lumber LVL engineered',
        'post': 'structural support pressure treated',
        'joist': 'floor ceiling framing lumber',
        'stud': 'wall framing lumber metal',
        'header': 'structural beam window door',
        'sill plate': 'foundation lumber pressure treated',
        'door': 'interior exterior entry patio sliding',
        'window': 'single double hung casement slider',
        'screen': 'window door mesh aluminum fiberglass',
        'weatherstrip': 'door window seal foam rubber',
        'threshold': 'door sill weatherproofing',
        'storm door': 'exterior protection aluminum',
        'glass': 'window pane replacement safety',
        'glazing': 'window putty compound installation',
        'cabinet': 'kitchen bathroom storage wall base',
        'drawer': 'cabinet storage slides hardware',
        'shelf': 'storage bracket support adjustable',
        'bracket': 'shelf support wall mounting',
        'organizer': 'closet storage system wire',
        'rail': 'closet rod support adjustable',
        'mulch': 'landscaping bark chips rubber',
        'soil': 'garden topsoil potting compost',
        'fertilizer': 'lawn garden plant nutrients',
        'seed': 'grass lawn renovation overseeding',
        'sod': 'grass lawn instant installation',
        'edging': 'landscape border plastic metal',
        'paver': 'patio walkway concrete brick',
        'gravel': 'landscaping drainage decorative',
        'sand': 'construction play landscaping',
        'fence post': 'fence deck pressure treated cedar',
        'fence rail': 'deck fence railing aluminum wood',
        'lattice': 'privacy screen vinyl wood',
        'gate': 'fence entry hardware security',
        'glue': 'adhesive wood PVA polyurethane epoxy',
        'adhesive': 'construction liquid nails spray',
        'epoxy': 'two-part adhesive metal concrete',
        'silicone': 'sealant bathroom kitchen clear',
        'foam': 'spray insulation gap filler',
        'duct tape': 'duct electrical masking double-sided',
        'safety glasses': 'eye protection clear tinted',
        'gloves': 'work safety leather nitrile',
        'mask': 'dust protection N95 respirator',
        'hard hat': 'head protection construction',
        'vest': 'safety high visibility reflective',
        'boots': 'work safety steel toe slip resistant',
        'extension cord': 'electrical outdoor GFCI',
        'ladder': 'step extension fiberglass aluminum',
        'scaffold': 'platform work height adjustable',
        'cleaner': 'all-purpose degreaser disinfectant',
        'soap': 'dish laundry hand cleaning',
        'bleach': 'disinfectant whitening cleaning',
        'solvent': 'paint thinner mineral spirits',
        'lubricant': 'WD-40 3-in-1 oil spray',
        'rust remover': 'naval jelly converter treatment'
    };
    for (const [keyword, enhancement] of Object.entries(searchEnhancements)) {
        if (itemLower.includes(keyword)) {
            searchQuery = `${itemName} ${enhancement}`;
            break;
        }
    }
    console.log(`Using search query: "${searchQuery}"`);
    const homeDepotProduct = await searchHomeDepotDirect(searchQuery);
    if (homeDepotProduct) {
        console.log(`Found Home Depot product for "${itemName}":`, homeDepotProduct);
        return {
            image_url: homeDepotProduct.image_url,
            product_url: homeDepotProduct.product_url,
            store_name: homeDepotProduct.store
        };
    }
    const lowesProduct = await searchLowesDirect(searchQuery);
    if (lowesProduct) {
        console.log(`Found Lowe's product for "${itemName}":`, lowesProduct);
        return {
            image_url: lowesProduct.image_url,
            product_url: lowesProduct.product_url,
            store_name: lowesProduct.store
        };
    }
    const hardwareImage = await searchGeneralHardware(itemName);
    if (hardwareImage) {
        console.log(`Using hardware image for "${itemName}":`, hardwareImage);
        return { image_url: hardwareImage };
    }
    console.log(`No product found for "${itemName}", using fallback`);
    const staticImages = {
        'putty knife': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'spackling compound': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400',
        'paint roller': 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400',
        'paint brush': 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400',
        'sandpaper': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'sanding block': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'primer': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400',
        'paint': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400',
        'caulk': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'wrench': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'screwdriver': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'drill': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'hammer': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'saw': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'pipe': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'fitting': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'valve': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'faucet': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'wire': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'outlet': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'switch': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'breaker': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'screw': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'nail': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'bolt': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'tool': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400',
        'hardware': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400'
    };
    const searchName = itemName.toLowerCase();
    if (staticImages[searchName]) {
        console.log(`Using static image for "${itemName}"`);
        return { image_url: staticImages[searchName] };
    }
    for (const [key, imageUrl] of Object.entries(staticImages)) {
        if (searchName.includes(key) || key.includes(searchName)) {
            console.log(`Using partial match static image for "${itemName}" (matched "${key}")`);
            return { image_url: imageUrl };
        }
    }
    console.log(`No image found for "${itemName}"`);
    return { image_url: null };
}
async function addProductImages(analysisResult) {
    if (analysisResult.materials) {
        const materialsWithProducts = await Promise.all(analysisResult.materials.map(async (material) => {
            const productInfo = await getProductInfo(material.name);
            return {
                ...material,
                image_url: productInfo.image_url,
                product_url: productInfo.product_url,
                store_name: productInfo.store_name
            };
        }));
        analysisResult.materials = materialsWithProducts;
    }
    if (analysisResult.tools) {
        const toolsWithProducts = await Promise.all(analysisResult.tools.map(async (tool) => {
            const productInfo = await getProductInfo(tool.name);
            return {
                ...tool,
                image_url: productInfo.image_url,
                product_url: productInfo.product_url,
                store_name: productInfo.store_name
            };
        }));
        analysisResult.tools = toolsWithProducts;
    }
    return analysisResult;
}
//# sourceMappingURL=productImages.js.map
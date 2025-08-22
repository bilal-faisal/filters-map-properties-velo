import { getFiltersConditioningData } from "backend/data.jsw"
import wixWindowFrontend from "wix-window-frontend";
import { orders } from 'wix-pricing-plans-frontend';
import { authentication } from 'wix-members';
import { to } from "wix-location-frontend"
import wixData from "wix-data";

let allProperties = null;
let allFilters = null;
let filteredProperties = null;
let filterMap = null;
let currentSearchText = "";
let searchTimeout = null;
let currentView = "map";
let BUSINESS_TYPE_FILTER_CONFIG = null;
const SEARCH_DELAY = 1000; // 1 second debouncing

// Your specific plan ID
const TARGET_PLAN_1_ID = "b3d1bba1-de69-47c5-93d2-be5ad8732caa";
const TARGET_PLAN_2_ID = "9f606bb4-aa66-4c57-8810-2d606932b31d";
let HAS_PREMIUM_PLAN = false;

$w.onReady(async function () {

    // Plan check
    const isLoggedIn = authentication.loggedIn();

    if (!isLoggedIn) {
        console.log("User is not logged in!");
        HAS_PREMIUM_PLAN = false;
    } else {

        const userHasPlan = await hasUserPurchasedPlan();

        if (userHasPlan) {
            // User has purchased the plan - show premium content
            HAS_PREMIUM_PLAN = true;
            console.log("User has access to premium content");
        } else {
            // User hasn't purchased the plan - show upgrade options
            HAS_PREMIUM_PLAN = false;
            console.log("User needs to upgrade to access premium content");
        }
    }
    if (HAS_PREMIUM_PLAN) {
        $w('#htmlMapNormal').collapse()
        $w('#htmlMapPremium').expand()
    } else {
        $w('#htmlMapPremium').collapse()
        $w('#htmlMapNormal').expand()
    }

    // Mobile check
    let formFactor = wixWindowFrontend.formFactor;
    if (formFactor == "Mobile") {
        $w('#boxFilters').collapse()
    }

    // Load business type filter configuration
    BUSINESS_TYPE_FILTER_CONFIG = await getFiltersConditioningData();

    // Initialize view state
    initializeViewToggle();

    // List View
    $w('#multiStateBoxView').changeState("map")

    await fetchAllProperties()
    await fetchAllFilters()

    if (allProperties && allFilters) {
        console.log("allProperties", allProperties)
        console.log("allFilters", allFilters)

        // Cache the filter map for performance
        createFilterMap()

        // Filter properties to only include those with filter data
        filterPropertiesWithFilterData()

        // Initialize filters UI
        initializeFilters()

        // Initially show all properties
        filteredProperties = allProperties
        // populatePropertyList()
        updateMapMarkers()

        // Set up event listeners
        setupFilterEventListeners()
        setupSearchEventListeners()
        setupViewToggleEventListeners()
        setupMapMessageListener()

        // Show initial count
        updateResultsCount()

        // Initialize filter visibility (show all filters initially)
        updateFilterVisibility("all")
    }

    if (formFactor == "Mobile") {
        $w('#buttonMobileToggleFilters').onClick(() => {
            const isCollapsed = $w('#boxFilters').collapsed
            if (isCollapsed) {
                $w('#boxFilters').expand()
                $w('#buttonMobileToggleFilters').label = "Hide Filters"
            } else {
                $w('#boxFilters').collapse()
                $w('#buttonMobileToggleFilters').label = "Show Filters"
            }
        })
    }
});

export async function hasUserPurchasedPlan() {
    try {
        const isLoggedIn = authentication.loggedIn();

        if (!isLoggedIn) {
            return false;
        }

        const memberOrders = await orders.listCurrentMemberOrders();

        return memberOrders.some(order =>
            (order.planId === TARGET_PLAN_1_ID || order.planId === TARGET_PLAN_2_ID) &&
            (order.status === "ACTIVE" || order.status === "PENDING")
        );

    } catch (error) {
        console.error("Error checking plan purchase:", error);
        return false;
    }
}

async function fetchAllProperties() {
    try {
        const results = await wixData
            .query("NewPropertyPageCms")
            .limit(500)
            .find()

        if (results.items.length > 0) {
            allProperties = results.items
        }
    } catch (error) {
        console.log("Error fetching properties:", error);
    }
}

async function fetchAllFilters() {
    try {
        const results = await wixData
            .query("PropertyFilters")
            .limit(500)
            .find();

        // Filter items that have the 'propertyReference' field
        const filteredResults = results.items.filter(item => item.propertyReference);

        if (filteredResults.length > 0) {
            allFilters = filteredResults;
            console.log("Filtered filters:", allFilters);
        }
    } catch (error) {
        console.log("Error fetching filters:", error);
    }
}

function createFilterMap() {
    filterMap = new Map();
    allFilters.forEach(filter => {
        filterMap.set(filter.propertyReference, filter);
    });
}

function filterPropertiesWithFilterData() {
    if (!allProperties || !allFilters) {
        return;
    }

    // Create a Set of property IDs that have filter data (where propertyReference is not empty)
    const propertiesWithFilters = new Set(
        allFilters
        .filter(filter => filter.propertyReference) // Ensure propertyReference is not empty
        .map(filter => filter.propertyReference)
    );

    // Only keep properties that have corresponding filter data
    allProperties = allProperties.filter(property => propertiesWithFilters.has(property._id));

    console.log(`Filtered to ${allProperties.length} properties with filter data`);
}

// Function to update filter visibility based on selected business type
function updateFilterVisibility(selectedBusinessType) {
    if (!BUSINESS_TYPE_FILTER_CONFIG) {
        console.log("Business type filter config not loaded yet");
        return;
    }

    // If "all" is selected, show all filters
    if (selectedBusinessType === "all") {
        expandAllFilters();
        return;
    }

    // Get the configuration for the selected business type
    const filterConfig = BUSINESS_TYPE_FILTER_CONFIG[selectedBusinessType];
    if (!filterConfig) {
        console.log(`No configuration found for business type: ${selectedBusinessType}`);
        expandAllFilters(); // Fallback to showing all filters
        return;
    }

    // Update each filter's visibility based on configuration
    Object.keys(filterConfig).forEach(filterName => {
        const shouldShow = filterConfig[filterName];
        updateSingleFilterVisibility(filterName, shouldShow);
    });

    console.log(`Updated filter visibility for business type: ${selectedBusinessType}`);
}

// Function to expand all filters
function expandAllFilters() {
    const filterElements = [
        '#checkboxGroupCountry', '#checkboxGroupArea',
        '#dropdownSleeps', '#dropdownHotTub', '#dropdownEnclosedGarden',
        '#dropdownNoOfDogsAllowed', '#dropdownNumberOfDogsAllowedPerRoom',
        '#dropdownAllBreedFriendly', '#dropdownSuitableForReactivePups',
        '#dropdownDogsAllowedOnFurniture', '#dropdownDogsAllowedToBeLeftAlone',
        '#dropdownEvChargerOnSite', '#dropdownEnclosedOutdoorAreaOrField',
        '#dropdownMuzzleFreeArea', '#dropdownFishingAvailable',
        '#dropdownOtherPetsanimalsAllowed', '#dropdownDogsFromMixedHouseholdsAllowed',
        '#dropdownWheelchairAccessible', '#dropdownChildrenWelcomed',
        '#dropdownWiFiAvailable', '#dropdownSharedFacilitiesOnSite',
        '#dropdownFreeParkingOnSite', '#dropdownFenceHeight',
        '#dropdownSizeOfGarden', '#dropdownSizeOfOutdoorArea',
        '#dropdownBookingType', '#dropdownBusinessType', '#dropdownPropertyType',
        '#dropdownIndoorOrOutdoor', '#dropdownPricePerNight', '#dropdownPricePerSession'
    ];

    filterElements.forEach(elementId => {
        try {
            $w(elementId).expand();
        } catch (error) {
            console.log(`Could not expand ${elementId}:`, error);
        }
    });

    // Temporary not avilable filters
    const filterElementsNotAvailableNow = [
        '#dropdownSizeOfGarden',
        '#dropdownNumberOfDogsAllowedPerRoom',
        '#dropdownDogsAllowedOnFurniture',
        '#dropdownDogsAllowedToBeLeftAlone',
        '#dropdownEvChargerOnSite',
        '#dropdownMuzzleFreeArea',
        '#dropdownIndoorOrOutdoor',
        '#dropdownOtherPetsanimalsAllowed',
        '#dropdownDogsFromMixedHouseholdsAllowed',
        '#dropdownFishingAvailable',
        '#dropdownWheelchairAccessible',
        '#dropdownChildrenWelcomed',
        '#dropdownWiFiAvailable',
        '#checkboxGroupArea',
        '#dropdownSizeOfOutdoorArea',
        '#dropdownSharedFacilitiesOnSite',
    ]
    filterElementsNotAvailableNow.forEach(elementId => {
        try {
            $w(elementId).collapse();
        } catch (error) {
            console.log(`Could not expand ${elementId}:`, error);
        }
    });
}

// Function to update visibility of a single filter
function updateSingleFilterVisibility(filterName, shouldShow) {
    const filterElementMap = {
        'country': '#checkboxGroupCountry',
        'locationArea': '#checkboxGroupArea',
        'sleeps': '#dropdownSleeps',
        'hotTub': '#dropdownHotTub',
        'enclosedGarden': '#dropdownEnclosedGarden',
        'numberOfDogsAllowed': '#dropdownNoOfDogsAllowed',
        'numberOfDogsAllowedPerRoom': '#dropdownNumberOfDogsAllowedPerRoom',
        'allBreedFriendly': '#dropdownAllBreedFriendly',
        'suitableForReactivePups': '#dropdownSuitableForReactivePups',
        'dogsAllowedOnFurniture': '#dropdownDogsAllowedOnFurniture',
        'dogsAllowedToBeLeftAlone': '#dropdownDogsAllowedToBeLeftAlone',
        'evChargerOnSite': '#dropdownEvChargerOnSite',
        'enclosedOutdoorAreaOrField': '#dropdownEnclosedOutdoorAreaOrField',
        'muzzleFreeArea': '#dropdownMuzzleFreeArea',
        'fishingAvailable': '#dropdownFishingAvailable',
        'otherPetsanimalsAllowed': '#dropdownOtherPetsanimalsAllowed',
        'dogsFromMixedHouseholdsAllowed': '#dropdownDogsFromMixedHouseholdsAllowed',
        'wheelchairAccessible': '#dropdownWheelchairAccessible',
        'childrenWelcomed': '#dropdownChildrenWelcomed',
        'wiFiAvailable': '#dropdownWiFiAvailable',
        'sharedFacilitiesOnSite': '#dropdownSharedFacilitiesOnSite',
        'freeParkingOnSite': '#dropdownFreeParkingOnSite',
        'fenceHeight': '#dropdownFenceHeight',
        'sizeOfGarden': '#dropdownSizeOfGarden',
        'sizeOfOutdoorArea': '#dropdownSizeOfOutdoorArea',
        'bookingType': '#dropdownBookingType',
        'businessType': '#dropdownBusinessType',
        'propertyType': '#dropdownPropertyType',
        'indoorOrOutdoor': '#dropdownIndoorOrOutdoor',
        'pricePerNight': '#dropdownPricePerNight',
        'pricePerSession': '#dropdownPricePerSession'
    };

    const elementId = filterElementMap[filterName];
    if (elementId) {
        try {
            if (shouldShow) {
                $w(elementId).expand();
            } else {
                $w(elementId).collapse();
            }
        } catch (error) {
            console.log(`Could not update visibility for ${elementId}:`, error);
        }
    }
}

// Initialize view toggle buttons
function initializeViewToggle() {
    // Set initial button states
    updateViewButtons();
}

// Set up event listeners for view toggle buttons
function setupViewToggleEventListeners() {
    $w('#buttonListView').onClick(() => {
        switchView("list");
    });

    $w('#buttonMapView').onClick(() => {
        switchView("map");
    });
}

// Set up message listener for navigation from map
function setupMapMessageListener() {
    // Listen for messages from the map iframe

    if (HAS_PREMIUM_PLAN) {

        $w('#htmlMapPremium').onMessage((event) => {
            if (event.data && event.data.type === 'navigate' && event.data.url) {
                to(event.data.url); // This handles the redirection
            }
        });
    } else {

        $w('#htmlMapNormal').onMessage((event) => {
            if (event.data && event.data.type === 'navigate' && event.data.url) {
                to(event.data.url); // This handles the redirection
            }
        });
    }
}

// Main function to handle view switching
function switchView(viewType) {
    if (currentView === viewType) {
        return; // Already in this view, no need to switch
    }

    console.log(`Switching from ${currentView} to ${viewType}`);

    // Update current view
    currentView = viewType;

    // Update button states
    updateViewButtons();

    // Update multistate box
    $w('#multiStateBoxView').changeState(viewType);

    // Handle view-specific logic
    if (viewType === "list") {
        handleListViewSwitch();
    } else if (viewType === "map") {
        handleMapViewSwitch();
    }
}

// Update button visual states (collapsed/expanded)
function updateViewButtons() {
    if (currentView === "list") {
        // List view is active
        $w('#buttonListView').collapse(); // Hide/collapse active button
        $w('#buttonMapView').expand(); // Show inactive button
    } else if (currentView === "map") {
        // Map view is active
        $w('#buttonMapView').collapse(); // Hide/collapse active button
        $w('#buttonListView').expand(); // Show inactive button
    }

    console.log(`View buttons updated for ${currentView} view`);
}

// Handle switching to list view
function handleListViewSwitch() {
    console.log("Switched to list view");

    // Refresh the property list with current filters
    populatePropertyList();
    updateResultsCount();
}

// Handle switching to map view
function handleMapViewSwitch() {
    console.log("Switched to map view");

    // Update results count for map view too
    updateResultsCount();

    // Send data to map
    updateMapMarkers();
}

function convertWixImageUrl(wixUrl) {
    // Handle null, undefined, or empty string
    if (!wixUrl || typeof wixUrl !== 'string') {
        return null;
    }

    const match = wixUrl.match(/^wix:image:\/\/v1\/([^\/]+)/);
    return match && match[1] ? `https://static.wixstatic.com/media/${match[1]}` : null;
}

// Send property data to the map HTML element
function updateMapMarkers() {
    console.log("Updating map markers...");

    if (!filteredProperties) {
        return;
    }

    // Prepare properties data for the map
    const propertiesData = filteredProperties.map(property => {
        const filterData = filterMap.get(property._id);
        const imageURL = convertWixImageUrl(property?.mainImageGallery?.[0]?.src);
        const isBookDirect = filterData.bookingType?.includes("Book Direct") || false;

        return {
            listingName: property.listingName,
            location: property.location,
            shortListingDescription: property.shortListingDescription,
            keyFeatures: property.keyFeatures,
            latitude: Number(property.mapAddressLocation?.location?.latitude),
            longitude: Number(property.mapAddressLocation?.location?.longitude),
            propertyType: filterData ? getPropertyTypeFromFilter(filterData) : 'default',
            bookingType: filterData.bookingType ? filterData.bookingType[0] : 'default',
            bookNowLink: property.bookNowLink,
            businessType: filterData.businessType ? filterData.businessType[0] : 'default',
            detailPageLink: property['link-new-property-page-cms-listingName'],
            isBookDirect: isBookDirect,
            imageURL: imageURL,
        };
    });

    if (HAS_PREMIUM_PLAN) {
        // Send data to map iframe
        $w('#htmlMapPremium').postMessage({
            type: 'updateMarkers',
            properties: propertiesData
        });
    } else {
        // Send data to map iframe
        $w('#htmlMapNormal').postMessage({
            type: 'updateMarkers',
            properties: propertiesData
        });
    }

}

// Helper function to determine property type from filter data
function getPropertyTypeFromFilter(filterData) {
    // Check booking type array for property type
    if (filterData.bookingType && Array.isArray(filterData.bookingType)) {
        if (filterData.bookingType.includes('Book Direct')) return 'Book Direct';
        if (filterData.bookingType.includes('Partner')) return 'Partner';
        if (filterData.bookingType.includes('Kennel')) return 'Kennel';
        if (filterData.bookingType.includes('Field')) return 'Field';
    }

    return 'default';
}

function initializeFilters() {
    if (!allFilters || allFilters.length === 0) {
        console.log("No filters to initialize");
        return;
    }

    const uniqueCountries = [...new Set(allFilters.map(filter => filter.country).filter(Boolean))];
    const uniqueAreas = [...new Set(allFilters.map(filter => filter.locationArea).filter(Boolean))];
    const uniqueFenceHeights = [...new Set(allFilters.map(filter => filter.fenceHeight).filter(Boolean))];
    const uniqueSizeOfGarden = [...new Set(allFilters.map(filter => filter.sizeOfGarden).filter(Boolean))];
    const uniqueSizeOfOutdoorArea = [...new Set(allFilters.map(filter => filter.sizeOfOutdoorArea).filter(Boolean))];
    const uniqueBookingTypes = [...new Set(allFilters.flatMap(filter => filter.bookingType || []).filter(Boolean))];
    const uniqueBusinessTypes = [...new Set(allFilters.flatMap(filter => filter.businessType || []).filter(Boolean))];
    const uniquePropertyTypes = [...new Set(allFilters.flatMap(filter => filter.propertyType || []).filter(Boolean))];
    const uniqueIndoorOrOutdoor = [...new Set(allFilters.flatMap(filter => filter.indoorOrOutdoor || []).filter(Boolean))];
    const uniquePricePerNight = [...new Set(allFilters.flatMap(filter => filter.pricePerNight || []).filter(Boolean))];
    const uniquePricePerSession = [...new Set(allFilters.flatMap(filter => filter.pricePerSession || []).filter(Boolean))];
    const sleepsRanges = ["1-5", "6-10", "11-15"];
    const dogAllowedRanges = ["1-3", "4-6", "7-9", "10-12"];
    const dogAllowedPerRoomRanges = ["1-3", "4-6", "7-9", "10-12"];

    setupCountryFilter(uniqueCountries);
    setupLocationAreaFilter(uniqueAreas);
    setupSleepsFilter(sleepsRanges);
    setupHotTubFilter();
    setupEnclosedGardenFilter();
    setupNoOfDogsAllowedFilter(dogAllowedRanges);
    setupNumberOfDogsAllowedPerRoomFilter(dogAllowedPerRoomRanges);
    setupAllBreedFriendlyFilter();
    setupSuitableForReactivePupsFilter();
    setupDogsAllowedOnFurnitureFilter();
    setupDogsAllowedToBeLeftAloneFilter();
    setupEvChargerOnSiteFilter();
    setupEnclosedOutdoorAreaOrFieldFilter();
    setupMuzzleFreeAreaFilter();
    setupFishingAvailableFilter();
    setupOtherPetsanimalsAllowedFilter();
    setupDogsFromMixedHouseholdsAllowedFilter();
    setupWheelchairAccessibleFilter();
    setupChildrenWelcomedFilter();
    setupWiFiAvailableFilter();
    setupSharedFacilitiesOnSiteFilter();
    setupFreeParkingOnSiteFilter();
    setupFenceHeightFilter(uniqueFenceHeights);
    setupSizeOfGardenFilter(uniqueSizeOfGarden);
    setupSizeOfOutdoorAreaFilter(uniqueSizeOfOutdoorArea);
    setupBookingTypeFilter(uniqueBookingTypes);
    setupBusinessTypeFilter(uniqueBusinessTypes);
    setupPropertyTypeFilter(uniquePropertyTypes);
    setupIndoorOrOutdoorFilter(uniqueIndoorOrOutdoor);
    setupPricePerNightFilter(uniquePricePerNight);
    setupPricePerSessionFilter(uniquePricePerSession);
}

function setupCountryFilter(countries) {
    const options = countries.map(country => ({ label: country, value: country }));

    $w('#checkboxGroupCountry').options = options;
    $w('#checkboxGroupCountry').value = [];
}

function setupLocationAreaFilter(areas) {
    const options = areas.map(area => ({ label: area, value: area }));

    $w('#checkboxGroupArea').options = options;
    $w('#checkboxGroupArea').value = [];
}

function setupSleepsFilter(ranges) {
    const options = [
        { label: "All", value: "all" },
        ...ranges.map(range => ({ label: range, value: range }))
    ];

    $w('#dropdownSleeps').options = options;
    $w('#dropdownSleeps').value = "all"; // Default to "All"
}

function setupHotTubFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownHotTub').options = options;
    $w('#dropdownHotTub').value = "all";
}

function setupEnclosedGardenFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownEnclosedGarden').options = options;
    $w('#dropdownEnclosedGarden').value = "all";
}

function setupNoOfDogsAllowedFilter(ranges) {
    // const options = [
    //     { label: "All", value: "all" },
    //     ...ranges.map(range => ({ label: range, value: range }))
    // ];
    const options = [
        { label: "All", value: "all" },
        { label: "1+", value: "1+" },
        { label: "2+", value: "2+" },
        { label: "5+", value: "5+" },
        { label: "10+", value: "10+" }
    ];

    $w('#dropdownNoOfDogsAllowed').options = options;
    $w('#dropdownNoOfDogsAllowed').value = "all"; // Default to "All"
}

function setupNumberOfDogsAllowedPerRoomFilter(ranges) {
    const options = [
        { label: "All", value: "all" },
        ...ranges.map(range => ({ label: range, value: range }))
    ];

    $w('#dropdownNumberOfDogsAllowedPerRoom').options = options;
    $w('#dropdownNumberOfDogsAllowedPerRoom').value = "all"; // Default to "All"
}

function setupAllBreedFriendlyFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownAllBreedFriendly').options = options;
    $w('#dropdownAllBreedFriendly').value = "all";
}

function setupSuitableForReactivePupsFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownSuitableForReactivePups').options = options;
    $w('#dropdownSuitableForReactivePups').value = "all";
}

function setupDogsAllowedOnFurnitureFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownDogsAllowedOnFurniture').options = options;
    $w('#dropdownDogsAllowedOnFurniture').value = "all";
}

function setupDogsAllowedToBeLeftAloneFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownDogsAllowedToBeLeftAlone').options = options;
    $w('#dropdownDogsAllowedToBeLeftAlone').value = "all";
}

function setupEvChargerOnSiteFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownEvChargerOnSite').options = options;
    $w('#dropdownEvChargerOnSite').value = "all";
}

function setupEnclosedOutdoorAreaOrFieldFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownEnclosedOutdoorAreaOrField').options = options;
    $w('#dropdownEnclosedOutdoorAreaOrField').value = "all";
}

function setupMuzzleFreeAreaFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownMuzzleFreeArea').options = options;
    $w('#dropdownMuzzleFreeArea').value = "all";
}

function setupFishingAvailableFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownFishingAvailable').options = options;
    $w('#dropdownFishingAvailable').value = "all";
}

function setupOtherPetsanimalsAllowedFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownOtherPetsanimalsAllowed').options = options;
    $w('#dropdownOtherPetsanimalsAllowed').value = "all";
}

function setupDogsFromMixedHouseholdsAllowedFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownDogsFromMixedHouseholdsAllowed').options = options;
    $w('#dropdownDogsFromMixedHouseholdsAllowed').value = "all";
}

function setupWheelchairAccessibleFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownWheelchairAccessible').options = options;
    $w('#dropdownWheelchairAccessible').value = "all";
}

function setupChildrenWelcomedFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownChildrenWelcomed').options = options;
    $w('#dropdownChildrenWelcomed').value = "all";
}

function setupWiFiAvailableFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownWiFiAvailable').options = options;
    $w('#dropdownWiFiAvailable').value = "all";
}

function setupSharedFacilitiesOnSiteFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownSharedFacilitiesOnSite').options = options;
    $w('#dropdownSharedFacilitiesOnSite').value = "all";
}

function setupFreeParkingOnSiteFilter() {
    const options = [
        { label: "All", value: "all" },
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
    ];

    $w('#dropdownFreeParkingOnSite').options = options;
    $w('#dropdownFreeParkingOnSite').value = "all";
}

function setupFenceHeightFilter(heights) {
    // const options = [
    //     { label: "All", value: "all" },
    //     ...heights.map(height => ({ label: height, value: height }))
    // ];
    const options = [
        { label: "All", value: "all" },
        { label: "1ft+", value: "1+" },
        { label: "3ft+", value: "3+" },
        { label: "6ft+", value: "6+" }
    ];

    $w('#dropdownFenceHeight').options = options;
    $w('#dropdownFenceHeight').value = "all";
}

function setupSizeOfGardenFilter(sizes) {
    const options = [
        { label: "All", value: "all" },
        ...sizes.map(size => ({ label: size, value: size }))
    ];

    $w('#dropdownSizeOfGarden').options = options;
    $w('#dropdownSizeOfGarden').value = "all";
}

function setupSizeOfOutdoorAreaFilter(sizes) {
    const options = [
        { label: "All", value: "all" },
        ...sizes.map(size => ({ label: size, value: size }))
    ];

    $w('#dropdownSizeOfOutdoorArea').options = options;
    $w('#dropdownSizeOfOutdoorArea').value = "all";
}

function setupBookingTypeFilter(types) {
    const options = [
        { label: "All", value: "all" },
        ...types.map(type => ({ label: type, value: type }))
    ];

    $w('#dropdownBookingType').options = options;
    $w('#dropdownBookingType').value = "all";
}

function setupBusinessTypeFilter(types) {
    const options = [
        { label: "All", value: "all" },
        ...types.map(type => ({ label: type, value: type }))
    ];

    $w('#dropdownBusinessType').options = options;
    $w('#dropdownBusinessType').value = "all";
}

function setupPropertyTypeFilter(types) {
    const options = [
        { label: "All", value: "all" },
        ...types.map(type => ({ label: type, value: type }))
    ];

    $w('#dropdownPropertyType').options = options;
    $w('#dropdownPropertyType').value = "all";
}

function setupIndoorOrOutdoorFilter(types) {
    const options = [
        { label: "All", value: "all" },
        ...types.map(type => ({ label: type, value: type }))
    ];

    $w('#dropdownIndoorOrOutdoor').options = options;
    $w('#dropdownIndoorOrOutdoor').value = "all";
}

function setupPricePerNightFilter(prices) {
    const options = [
        { label: "All", value: "all" },
        ...prices.map(price => ({ label: price, value: price }))
    ];

    $w('#dropdownPricePerNight').options = options;
    $w('#dropdownPricePerNight').value = "all";
}

function setupPricePerSessionFilter(prices) {
    const options = [
        { label: "All", value: "all" },
        ...prices.map(price => ({ label: price, value: price }))
    ];

    $w('#dropdownPricePerSession').options = options;
    $w('#dropdownPricePerSession').value = "all";
}

function setupFilterEventListeners() {
    $w('#checkboxGroupCountry').onChange(() => {
        applyFilters();
    });

    $w('#checkboxGroupArea').onChange(() => {
        applyFilters();
    });

    $w('#dropdownSleeps').onChange(() => {
        applyFilters();
    });

    $w('#dropdownHotTub').onChange(() => {
        applyFilters();
    });

    $w('#dropdownEnclosedGarden').onChange(() => {
        applyFilters();
    });

    $w('#dropdownNoOfDogsAllowed').onChange(() => {
        applyFilters();
    });

    $w('#dropdownNumberOfDogsAllowedPerRoom').onChange(() => {
        applyFilters();
    });

    $w('#dropdownAllBreedFriendly').onChange(() => {
        applyFilters();
    });

    $w('#dropdownSuitableForReactivePups').onChange(() => {
        applyFilters();
    });

    $w('#dropdownDogsAllowedOnFurniture').onChange(() => {
        applyFilters();
    });

    $w('#dropdownDogsAllowedToBeLeftAlone').onChange(() => {
        applyFilters();
    });

    $w('#dropdownEvChargerOnSite').onChange(() => {
        applyFilters();
    });

    $w('#dropdownEnclosedOutdoorAreaOrField').onChange(() => {
        applyFilters();
    });

    $w('#dropdownMuzzleFreeArea').onChange(() => {
        applyFilters();
    });

    $w('#dropdownFishingAvailable').onChange(() => {
        applyFilters();
    });

    $w('#dropdownOtherPetsanimalsAllowed').onChange(() => {
        applyFilters();
    });

    $w('#dropdownDogsFromMixedHouseholdsAllowed').onChange(() => {
        applyFilters();
    });

    $w('#dropdownWheelchairAccessible').onChange(() => {
        applyFilters();
    });

    $w('#dropdownChildrenWelcomed').onChange(() => {
        applyFilters();
    });

    $w('#dropdownWiFiAvailable').onChange(() => {
        applyFilters();
    });

    $w('#dropdownSharedFacilitiesOnSite').onChange(() => {
        applyFilters();
    });

    $w('#dropdownFreeParkingOnSite').onChange(() => {
        applyFilters();
    });

    $w('#dropdownFenceHeight').onChange(() => {
        applyFilters();
    });

    $w('#dropdownSizeOfGarden').onChange(() => {
        applyFilters();
    });

    $w('#dropdownSizeOfOutdoorArea').onChange(() => {
        applyFilters();
    });

    $w('#dropdownBookingType').onChange(() => {
        applyFilters();
    });

    $w('#dropdownBusinessType').onChange(() => {
        const selectedBusinessType = $w('#dropdownBusinessType').value;
        updateFilterVisibility(selectedBusinessType);
        applyFilters();
    });

    $w('#dropdownPropertyType').onChange(() => {
        applyFilters();
    });

    $w('#dropdownIndoorOrOutdoor').onChange(() => {
        applyFilters();
    });

    $w('#dropdownPricePerNight').onChange(() => {
        applyFilters();
    });

    $w('#dropdownPricePerSession').onChange(() => {
        applyFilters();
    });
}

function setupSearchEventListeners() {
    $w('#inputSearch').onInput(() => {
        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Show searching state immediately
        showSearchingState();

        // Set new timeout for debounced search
        searchTimeout = setTimeout(() => {
            currentSearchText = $w('#inputSearch').value.toLowerCase().trim();
            applyFilters();
        }, SEARCH_DELAY);
    });

    $w('#iconClearSearchBar').onClick(() => {
        // Clear any pending search
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        $w('#inputSearch').value = "";
        currentSearchText = "";
        applyFilters();
    });
}

function showSearchingState() {
    // Only show searching state if there's actually text being typed
    if ($w('#inputSearch').value.trim()) {
        // You can add a loading indicator here if you have one
        // $w('#loadingIcon').show();
        console.log("Searching...");
    }
}

function applyFilters() {
    if (!allProperties || !filterMap) {
        return;
    }

    const countryValues = $w('#checkboxGroupCountry').value;
    const areaValues = $w('#checkboxGroupArea').value;
    const sleepsValue = $w('#dropdownSleeps').value;
    const hotTubValue = $w('#dropdownHotTub').value;
    const enclosedGardenValue = $w('#dropdownEnclosedGarden').value;
    const noOfDogsAllowedValue = $w('#dropdownNoOfDogsAllowed').value;
    const numberOfDogsAllowedPerRoomValue = $w('#dropdownNumberOfDogsAllowedPerRoom').value;
    const allBreedFriendlyValue = $w('#dropdownAllBreedFriendly').value;
    const suitableForReactivePupsValue = $w('#dropdownSuitableForReactivePups').value;
    const dogsAllowedOnFurnitureValue = $w('#dropdownDogsAllowedOnFurniture').value;
    const dogsAllowedToBeLeftAloneValue = $w('#dropdownDogsAllowedToBeLeftAlone').value;
    const evChargerOnSiteValue = $w('#dropdownEvChargerOnSite').value;
    const enclosedOutdoorAreaOrFieldValue = $w('#dropdownEnclosedOutdoorAreaOrField').value;
    const muzzleFreeAreaValue = $w('#dropdownMuzzleFreeArea').value;
    const fishingAvailableValue = $w('#dropdownFishingAvailable').value;
    const otherPetsanimalsAllowedValue = $w('#dropdownOtherPetsanimalsAllowed').value;
    const dogsFromMixedHouseholdsAllowedValue = $w('#dropdownDogsFromMixedHouseholdsAllowed').value;
    const wheelchairAccessibleValue = $w('#dropdownWheelchairAccessible').value;
    const childrenWelcomedValue = $w('#dropdownChildrenWelcomed').value;
    const wiFiAvailableValue = $w('#dropdownWiFiAvailable').value;
    const sharedFacilitiesOnSiteValue = $w('#dropdownSharedFacilitiesOnSite').value;
    const freeParkingOnSiteValue = $w('#dropdownFreeParkingOnSite').value;
    const fenceHeightValue = $w('#dropdownFenceHeight').value;
    const sizeOfGardenValue = $w('#dropdownSizeOfGarden').value;
    const sizeOfOutdoorAreaValue = $w('#dropdownSizeOfOutdoorArea').value;
    const bookingTypeValue = $w('#dropdownBookingType').value;
    const businessTypeValue = $w('#dropdownBusinessType').value;
    const propertyTypeValue = $w('#dropdownPropertyType').value;
    const indoorOrOutdoorValue = $w('#dropdownIndoorOrOutdoor').value;
    const pricePerNightValue = $w('#dropdownPricePerNight').value;
    const pricePerSessionValue = $w('#dropdownPricePerSession').value;

    // Get filter configuration for conditional filtering
    const filterConfig = businessTypeValue !== "all" && BUSINESS_TYPE_FILTER_CONFIG ?
        BUSINESS_TYPE_FILTER_CONFIG[businessTypeValue] :
        null;

    filteredProperties = allProperties.filter(property => {
        // First check search criteria if search text exists
        if (currentSearchText && !property.location?.toLowerCase().includes(currentSearchText)) {
            return false;
        }

        // Then apply other filters
        const filterData = filterMap.get(property._id);
        if (!filterData) {
            return false; // This should not happen anymore since we pre-filtered
        }

        // Country filter
        if (countryValues.length > 0 && (!filterConfig || filterConfig.country) && !countryValues.includes(filterData.country)) {
            return false;
        }

        // Area filter
        if (areaValues.length > 0 && (!filterConfig || filterConfig.locationArea) && !areaValues.includes(filterData.locationArea)) {
            return false;
        }

        // Sleeps filter
        if (sleepsValue !== "all" && (!filterConfig || filterConfig.sleeps) && !checkSleepsRange(filterData.sleeps, sleepsValue)) {
            return false;
        }

        // Hot Tub filter
        if (hotTubValue !== "all" && (!filterConfig || filterConfig.hotTub) && !checkHotTubFilter(filterData.hotTub, hotTubValue)) {
            return false;
        }

        // Enclosed Garden filter
        if (enclosedGardenValue !== "all" && (!filterConfig || filterConfig.enclosedGarden) && !checkEnclosedGardenFilter(filterData, enclosedGardenValue)) {
            return false;
        }

        // Number of Dogs Allowed filter
        if (noOfDogsAllowedValue !== "all" && (!filterConfig || filterConfig.numberOfDogsAllowed) && !checkNoOfDogsAllowedRange(filterData.numberOfDogsAllowed, noOfDogsAllowedValue)) {
            return false;
        }

        // Number of Dogs Allowed Per Room filter
        if (numberOfDogsAllowedPerRoomValue !== "all" && (!filterConfig || filterConfig.numberOfDogsAllowedPerRoom) && !checkNumberOfDogsAllowedPerRoomRange(filterData.numberOfDogsAllowedPerRoom, numberOfDogsAllowedPerRoomValue)) {
            return false;
        }

        // All Breed Friendly filter
        if (allBreedFriendlyValue !== "all" && (!filterConfig || filterConfig.allBreedFriendly) && !checkAllBreedFriendlyFilter(filterData.allBreedFriendly, allBreedFriendlyValue)) {
            return false;
        }

        // Suitable for Reactive Pups filter
        if (suitableForReactivePupsValue !== "all" && (!filterConfig || filterConfig.suitableForReactivePups) && !checkSuitableForReactivePupsFilter(filterData.suitableForReactivePups, suitableForReactivePupsValue)) {
            return false;
        }

        // Dogs Allowed on Furniture filter
        if (dogsAllowedOnFurnitureValue !== "all" && (!filterConfig || filterConfig.dogsAllowedOnFurniture) && !checkDogsAllowedOnFurnitureFilter(filterData.dogsAllowedOnFurniture, dogsAllowedOnFurnitureValue)) {
            return false;
        }

        // Dogs Allowed to be Left Alone filter
        if (dogsAllowedToBeLeftAloneValue !== "all" && (!filterConfig || filterConfig.dogsAllowedToBeLeftAlone) && !checkDogsAllowedToBeLeftAloneFilter(filterData.dogsAllowedToBeLeftAlone, dogsAllowedToBeLeftAloneValue)) {
            return false;
        }

        // EV Charger on Site filter
        if (evChargerOnSiteValue !== "all" && (!filterConfig || filterConfig.evChargerOnSite) && !checkEvChargerOnSiteFilter(filterData.evChargerOnSite, evChargerOnSiteValue)) {
            return false;
        }

        // Enclosed Outdoor Area or Field filter
        if (enclosedOutdoorAreaOrFieldValue !== "all" && (!filterConfig || filterConfig.enclosedOutdoorAreaOrField) && !checkEnclosedOutdoorAreaOrFieldFilter(filterData.enclosedOutdoorAreaOrField, enclosedOutdoorAreaOrFieldValue)) {
            return false;
        }

        // Muzzle Free Area filter
        if (muzzleFreeAreaValue !== "all" && (!filterConfig || filterConfig.muzzleFreeArea) && !checkMuzzleFreeAreaFilter(filterData.muzzleFreeArea, muzzleFreeAreaValue)) {
            return false;
        }

        // Fishing Available filter
        if (fishingAvailableValue !== "all" && (!filterConfig || filterConfig.fishingAvailable) && !checkFishingAvailableFilter(filterData.fishingAvailable, fishingAvailableValue)) {
            return false;
        }

        // Other pets/animals allowed filter
        if (otherPetsanimalsAllowedValue !== "all" && (!filterConfig || filterConfig.otherPetsanimalsAllowed) && !checkOtherPetsanimalsAllowedFilter(filterData.otherPetsanimalsAllowed, otherPetsanimalsAllowedValue)) {
            return false;
        }

        // Dogs from mixed households allowed filter
        if (dogsFromMixedHouseholdsAllowedValue !== "all" && (!filterConfig || filterConfig.dogsFromMixedHouseholdsAllowed) && !checkDogsFromMixedHouseholdsAllowedFilter(filterData.dogsFromMixedHouseholdsAllowed, dogsFromMixedHouseholdsAllowedValue)) {
            return false;
        }

        // Wheelchair Accessible filter
        if (wheelchairAccessibleValue !== "all" && (!filterConfig || filterConfig.wheelchairAccessible) && !checkWheelchairAccessibleFilter(filterData.wheelchairAccessible, wheelchairAccessibleValue)) {
            return false;
        }

        // Children Welcomed filter
        if (childrenWelcomedValue !== "all" && (!filterConfig || filterConfig.childrenWelcomed) && !checkChildrenWelcomedFilter(filterData.childrenWelcomed, childrenWelcomedValue)) {
            return false;
        }

        // WiFi Available filter
        if (wiFiAvailableValue !== "all" && (!filterConfig || filterConfig.wiFiAvailable) && !checkWiFiAvailableFilter(filterData.wiFiAvailable, wiFiAvailableValue)) {
            return false;
        }

        // Shared Facilities On Site filter
        if (sharedFacilitiesOnSiteValue !== "all" && (!filterConfig || filterConfig.sharedFacilitiesOnSite) && !checkSharedFacilitiesOnSiteFilter(filterData.sharedFacilitiesOnSite, sharedFacilitiesOnSiteValue)) {
            return false;
        }

        // Free Parking On Site filter
        if (freeParkingOnSiteValue !== "all" && (!filterConfig || filterConfig.freeParkingOnSite) && !checkFreeParkingOnSiteFilter(filterData.freeParkingOnSite, freeParkingOnSiteValue)) {
            return false;
        }

        // Fence Height filter
        if (fenceHeightValue !== "all" && (!filterConfig || filterConfig.fenceHeight) && !checkFenceHeightFilter(filterData.fenceHeight, fenceHeightValue)) {
            return false;
        }

        // Size of Garden filter
        if (sizeOfGardenValue !== "all" && (!filterConfig || filterConfig.sizeOfGarden) && !checkSizeOfGardenFilter(filterData.sizeOfGarden, sizeOfGardenValue)) {
            return false;
        }

        // Size of Outdoor Area filter
        if (sizeOfOutdoorAreaValue !== "all" && (!filterConfig || filterConfig.sizeOfOutdoorArea) && !checkSizeOfOutdoorAreaFilter(filterData.sizeOfOutdoorArea, sizeOfOutdoorAreaValue)) {
            return false;
        }

        // Booking Type filter
        if (bookingTypeValue !== "all" && (!filterConfig || filterConfig.bookingType) && !checkBookingTypeFilter(filterData.bookingType, bookingTypeValue)) {
            return false;
        }

        // Business Type filter - ALWAYS apply when business type is selected (not controlled by config)
        if (businessTypeValue !== "all" && !checkBusinessTypeFilter(filterData.businessType, businessTypeValue)) {
            return false;
        }

        // Property Type filter
        if (propertyTypeValue !== "all" && (!filterConfig || filterConfig.propertyType) && !checkPropertyTypeFilter(filterData.propertyType, propertyTypeValue)) {
            return false;
        }

        // Indoor or Outdoor filter
        if (indoorOrOutdoorValue !== "all" && (!filterConfig || filterConfig.indoorOrOutdoor) && !checkIndoorOrOutdoorFilter(filterData.indoorOrOutdoor, indoorOrOutdoorValue)) {
            return false;
        }

        // Price per Night filter
        if (pricePerNightValue !== "all" && (!filterConfig || filterConfig.pricePerNight) && !checkPricePerNightFilter(filterData.pricePerNight, pricePerNightValue)) {
            return false;
        }

        // Price per Session filter
        if (pricePerSessionValue !== "all" && (!filterConfig || filterConfig.pricePerSession) && !checkPricePerSessionFilter(filterData.pricePerSession, pricePerSessionValue)) {
            return false;
        }

        return true;
    });

    // Update both views based on current state
    if (currentView === "list") {
        populatePropertyList();
    } else if (currentView === "map") {
        updateMapMarkers();
    }

    updateResultsCount();

    console.log(`Filtered ${filteredProperties.length} properties out of ${allProperties.length} total`);
}

function checkSleepsRange(sleepsCount, selectedRange) {
    if (!sleepsCount || !selectedRange) return false;

    const count = parseInt(sleepsCount);

    switch (selectedRange) {
    case "1-5":
        return count >= 1 && count <= 5;
    case "6-10":
        return count >= 6 && count <= 10;
    case "11-15":
        return count >= 11 && count <= 15;
    default:
        return false;
    }
}

function checkHotTubFilter(hotTubValue, selectedValue) {
    if (selectedValue === "yes") {
        return hotTubValue === true;
    } else if (selectedValue === "no") {
        return hotTubValue !== true;
    }
    return true;
}

function checkEnclosedGardenFilter(filterData, selectedValue) {
    if (selectedValue === "yes") {
        return true;
    } else if (selectedValue === "no") {
        return false;
    }
    return true;
}

// function checkNoOfDogsAllowedRange(numberOfDogs, selectedRange) {
//     if (!numberOfDogs || !selectedRange) return false;

//     const count = parseInt(numberOfDogs);

//     switch (selectedRange) {
//     case "1-3":
//         return count >= 1 && count <= 3;
//     case "4-6":
//         return count >= 4 && count <= 6;
//     case "7-9":
//         return count >= 7 && count <= 9;
//     case "10-12":
//         return count >= 10 && count <= 12;
//     default:
//         return false;
//     }
// }
function checkNoOfDogsAllowedRange(numberOfDogs, selectedValue) {
    if (!numberOfDogs || selectedValue === "all") return selectedValue === "all";

    const count = parseInt(numberOfDogs);
    const threshold = parseInt(selectedValue.replace('+', ''));

    return count >= threshold;
}

function checkNumberOfDogsAllowedPerRoomRange(numberOfDogsPerRoom, selectedRange) {
    if (!numberOfDogsPerRoom || !selectedRange) return false;

    const count = parseInt(numberOfDogsPerRoom);

    switch (selectedRange) {
    case "1-3":
        return count >= 1 && count <= 3;
    case "4-6":
        return count >= 4 && count <= 6;
    case "7-9":
        return count >= 7 && count <= 9;
    case "10-12":
        return count >= 10 && count <= 12;
    default:
        return false;
    }
}

function checkAllBreedFriendlyFilter(allBreedFriendlyValue, selectedValue) {
    if (selectedValue === "yes") {
        return allBreedFriendlyValue === true;
    } else if (selectedValue === "no") {
        return allBreedFriendlyValue !== true;
    }
    return true; // for "all" option
}

function checkSuitableForReactivePupsFilter(suitableForReactivePupsValue, selectedValue) {
    if (selectedValue === "yes") {
        return suitableForReactivePupsValue === true;
    } else if (selectedValue === "no") {
        return suitableForReactivePupsValue !== true;
    }
    return true; // for "all" option
}

function checkDogsAllowedOnFurnitureFilter(dogsAllowedOnFurnitureValue, selectedValue) {
    if (selectedValue === "yes") {
        return dogsAllowedOnFurnitureValue === true;
    } else if (selectedValue === "no") {
        return dogsAllowedOnFurnitureValue !== true;
    }
    return true; // for "all" option
}

function checkDogsAllowedToBeLeftAloneFilter(dogsAllowedToBeLeftAloneValue, selectedValue) {
    if (selectedValue === "yes") {
        return dogsAllowedToBeLeftAloneValue === true;
    } else if (selectedValue === "no") {
        return dogsAllowedToBeLeftAloneValue !== true;
    }
    return true; // for "all" option
}

function checkEvChargerOnSiteFilter(evChargerOnSiteValue, selectedValue) {
    if (selectedValue === "yes") {
        return evChargerOnSiteValue === true;
    } else if (selectedValue === "no") {
        return evChargerOnSiteValue !== true;
    }
    return true; // for "all" option
}

function checkEnclosedOutdoorAreaOrFieldFilter(enclosedOutdoorAreaOrFieldValue, selectedValue) {
    if (selectedValue === "yes") {
        return enclosedOutdoorAreaOrFieldValue === true;
    } else if (selectedValue === "no") {
        return enclosedOutdoorAreaOrFieldValue !== true;
    }
    return true; // for "all" option
}

function checkMuzzleFreeAreaFilter(muzzleFreeAreaValue, selectedValue) {
    if (selectedValue === "yes") {
        return muzzleFreeAreaValue === true;
    } else if (selectedValue === "no") {
        return muzzleFreeAreaValue !== true;
    }
    return true; // for "all" option
}

function checkFishingAvailableFilter(fishingAvailableValue, selectedValue) {
    if (selectedValue === "yes") {
        return fishingAvailableValue === true;
    } else if (selectedValue === "no") {
        return fishingAvailableValue !== true;
    }
    return true; // for "all" option
}

function checkOtherPetsanimalsAllowedFilter(otherPetsanimalsAllowedValue, selectedValue) {
    if (selectedValue === "yes") {
        return otherPetsanimalsAllowedValue === true;
    } else if (selectedValue === "no") {
        return otherPetsanimalsAllowedValue !== true;
    }
    return true; // for "all" option
}

function checkDogsFromMixedHouseholdsAllowedFilter(dogsFromMixedHouseholdsAllowedValue, selectedValue) {
    if (selectedValue === "yes") {
        return dogsFromMixedHouseholdsAllowedValue === true;
    } else if (selectedValue === "no") {
        return dogsFromMixedHouseholdsAllowedValue !== true;
    }
    return true; // for "all" option
}

function checkWheelchairAccessibleFilter(wheelchairAccessibleValue, selectedValue) {
    if (selectedValue === "yes") {
        return wheelchairAccessibleValue === true;
    } else if (selectedValue === "no") {
        return wheelchairAccessibleValue !== true;
    }
    return true; // for "all" option
}

function checkChildrenWelcomedFilter(childrenWelcomedValue, selectedValue) {
    if (selectedValue === "yes") {
        return childrenWelcomedValue === true;
    } else if (selectedValue === "no") {
        return childrenWelcomedValue !== true;
    }
    return true; // for "all" option
}

function checkWiFiAvailableFilter(wiFiAvailableValue, selectedValue) {
    if (selectedValue === "yes") {
        return wiFiAvailableValue === true;
    } else if (selectedValue === "no") {
        return wiFiAvailableValue !== true;
    }
    return true; // for "all" option
}

function checkSharedFacilitiesOnSiteFilter(sharedFacilitiesOnSiteValue, selectedValue) {
    if (selectedValue === "yes") {
        return sharedFacilitiesOnSiteValue === true;
    } else if (selectedValue === "no") {
        return sharedFacilitiesOnSiteValue !== true;
    }
    return true; // for "all" option
}

function checkFreeParkingOnSiteFilter(freeParkingOnSiteValue, selectedValue) {
    if (selectedValue === "yes") {
        return freeParkingOnSiteValue === true;
    } else if (selectedValue === "no") {
        return freeParkingOnSiteValue !== true;
    }
    return true; // for "all" option
}

// function checkFenceHeightFilter(fenceHeightValue, selectedValue) {
//     if (!fenceHeightValue || selectedValue === "all") {
//         return selectedValue === "all"; // Only return true for "all" if no fence height data
//     }
//     return fenceHeightValue === selectedValue;
// }
function checkFenceHeightFilter(fenceHeightValue, selectedValue) {
    if (!fenceHeightValue || selectedValue === "all") {
        return selectedValue === "all";
    }

    if (selectedValue.includes('+')) {
        const threshold = parseInt(selectedValue.replace(/[ft+]/g, ''));
        const propertyHeight = parseInt(fenceHeightValue.replace(/[ft]/g, ''));
        return propertyHeight >= threshold;
    }

    // Fallback for exact match (if any old data exists)
    return fenceHeightValue === selectedValue;
}

function checkSizeOfGardenFilter(sizeOfGardenValue, selectedValue) {
    if (!sizeOfGardenValue || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no size of garden data
    }
    return sizeOfGardenValue === selectedValue;
}

function checkSizeOfOutdoorAreaFilter(sizeOfOutdoorAreaValue, selectedValue) {
    if (!sizeOfOutdoorAreaValue || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no size of outdoor area data
    }
    return sizeOfOutdoorAreaValue === selectedValue;
}

function checkBookingTypeFilter(bookingTypeArray, selectedValue) {
    if (!bookingTypeArray || !Array.isArray(bookingTypeArray) || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no booking type data
    }
    return bookingTypeArray.includes(selectedValue);
}

function checkBusinessTypeFilter(businessTypeArray, selectedValue) {
    if (!businessTypeArray || !Array.isArray(businessTypeArray) || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no business type data
    }
    return businessTypeArray.includes(selectedValue);
}

function checkPropertyTypeFilter(propertyTypeArray, selectedValue) {
    if (!propertyTypeArray || !Array.isArray(propertyTypeArray) || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no property type data
    }
    return propertyTypeArray.includes(selectedValue);
}

function checkIndoorOrOutdoorFilter(indoorOrOutdoorArray, selectedValue) {
    if (!indoorOrOutdoorArray || !Array.isArray(indoorOrOutdoorArray) || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no indoor/outdoor data
    }
    return indoorOrOutdoorArray.includes(selectedValue);
}

function checkPricePerNightFilter(pricePerNightArray, selectedValue) {
    if (!pricePerNightArray || !Array.isArray(pricePerNightArray) || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no price per night data
    }
    return pricePerNightArray.includes(selectedValue);
}

function checkPricePerSessionFilter(pricePerSessionArray, selectedValue) {
    if (!pricePerSessionArray || !Array.isArray(pricePerSessionArray) || selectedValue === "all") {
        return selectedValue === "all"; // Only return true for "all" if no price per session data
    }
    return pricePerSessionArray.includes(selectedValue);
}

function updateResultsCount() {
    const count = filteredProperties ? filteredProperties.length : 0;
    const searchText = currentSearchText ? ` for "${currentSearchText}"` : "";

    // Update results count if you have a text element for it
    // $w('#textResultsCount').text = `${count} properties found${searchText}`;

    console.log(`${count} properties found${searchText}`);
}

function populatePropertyList() {
    const propertiesToShow = filteredProperties || allProperties;

    if (!propertiesToShow || propertiesToShow.length === 0) {
        console.log("No properties to display");
        $w('#repeaterLists').data = [];
        return;
    }

    $w('#repeaterLists').data = propertiesToShow;

    $w('#repeaterLists').onItemReady(($item, itemData, index) => {

        const filterData = filterMap.get(itemData._id);
        const isBookDirect = filterData.bookingType?.includes("Book Direct") || false;

        // Set main image
        if (itemData.mainImageGallery && itemData.mainImageGallery.length > 0) {
            $item('#imageMain').src = itemData.mainImageGallery[0].src;
            $item('#imageMain').alt = itemData.listingName || "Property Image";
        } else {
            $item('#imageMain').src = "https://via.placeholder.com/400x300?text=No+Image";
        }

        // Set property title with search highlighting (optional)
        const propertyTitle = itemData.listingName || "Property Name Not Available";
        $item('#textPropertyTitle').text = propertyTitle;

        // Set location
        let locationText = itemData.location || "Location Not Available";
        locationText = locationText.replace(/⚲\s*/g, '').trim();
        $item('#textLocation').text = locationText;

        // Set description
        $item('#textShortDescription').text = itemData.shortListingDescription || "Description not available";

        if (!HAS_PREMIUM_PLAN) {
            $item('#textPropertyTitle').customClassList.add("blurr-effect");
            $item('#textShortDescription').customClassList.add("blurr-effect");
            $item('#boxKeyFeatures').customClassList.add("blurr-effect");
            $item('#textLocation').customClassList.add("blurr-effect");
        }

        if (isBookDirect) {
            $item("#buttonBookNow").show()
        } else {
            $item("#buttonBookNow").hide()
        }

        // Set up button events
        $item('#buttonBookNow').onClick(() => {
            // if (itemData.bookNowLink) {
            //     to(itemData.bookNowLink);
            // } else {
            //     console.log("No booking link available for this property");
            // }
            if (HAS_PREMIUM_PLAN) {
                if (itemData['link-new-property-page-cms-listingName']) {
                    to(itemData['link-new-property-page-cms-listingName']);
                } else {
                    console.log("No detail page link available for this property");
                }
            } else {
                to("https://www.xlescapes.com/pricing-plans/list");
            }
        });

        $item('#buttonViewDetails').onClick(() => {
            if (HAS_PREMIUM_PLAN) {
                if (itemData['link-new-property-page-cms-listingName']) {
                    to(itemData['link-new-property-page-cms-listingName']);
                } else {
                    console.log("No detail page link available for this property");
                }
            } else {
                to("https://www.xlescapes.com/pricing-plans/list");
            }
        });

        setupKeyFeatures($item, itemData);
    });
}

function setupKeyFeatures($item, itemData) {
    const keyFeaturesText = itemData.keyFeatures || "";

    let features = keyFeaturesText
        .split(/[·•|]/)
        .map(feature => feature.trim())
        .filter(feature => feature.length > 0);

    if (features.length <= 1) {
        features = keyFeaturesText
            .split(/[,\n]/)
            .map(feature => feature.trim())
            .filter(feature => feature.length > 0);
    }

    const totalFeatures = features.length;
    const buttonIds = ['#buttonFeature1', '#buttonFeature2', '#buttonFeature3', '#buttonFeature4'];

    // Hide all feature buttons first
    buttonIds.forEach(buttonId => {
        $item(buttonId).hide();
    });

    if (totalFeatures === 0) {
        return;
    }

    // Show up to 3 features
    for (let i = 0; i < Math.min(totalFeatures, 3); i++) {
        $item(buttonIds[i]).show();
        $item(buttonIds[i]).label = features[i];
    }

    // Show "+X more" button if there are more than 3 features
    if (totalFeatures > 3) {
        const remainingCount = totalFeatures - 3;
        $item('#buttonFeature4').show();
        $item('#buttonFeature4').label = `+${remainingCount} more`;
    }
}
/// <reference path="index.ts" />
/**
    Namespace for All AlienTube operations.
    @namespace AlienTube
*/
module AlienTube {
    /**
        Starts a new instance of the AlienTube comment section and adds it to DOM.
        @class CommentSection
        @param currentVideoIdentifier YouTube Video query identifier.
    */
    export class CommentSection {
        template : HTMLDocument;
        threadCollection: Array<any>;
        storedTabCollection : Array<CommentThread>;

        constructor(currentVideoIdentifier:string) {
            this.threadCollection = new Array();
            this.storedTabCollection = new Array();

            // Make sure video identifier is not null. If it is null we are not on a video page so we will just time out.
            if (currentVideoIdentifier) {
                // Load the html5 template file from disk and wait for it to load.
                var templateLink = document.createElement("link");
                templateLink.id = "alientubeTemplate";
                templateLink.onload = () => {
                    this.template = templateLink.import;

                    // Set loading indicator.
                    var loadingContentIndicator = this.template.getElementById("loading").content.cloneNode(true);
                    loadingContentIndicator.querySelector(".loading").appendChild(document.createTextNode(Main.localisationManager.get("loadingContentText")));
                    this.set(loadingContentIndicator);

                    // Open a search request to Reddit for the video identfiier
                    var videoSearchString = encodeURIComponent("url:'/watch?v=" + currentVideoIdentifier + "' (site:youtube.com OR site:youtu.be)");
                    new HttpRequest("https://pay.reddit.com/search.json?q=" + videoSearchString, RequestType.GET, (response :string) => {
                        var results = JSON.parse(response);

                        // There are a number of ways the Reddit API can arbitrarily explode, here are some of them.
                        if (results == '{}' || results.kind !== 'Listing' || results.data.children.length === 0) {
                            this.returnNoResults();
                        } else {
                            var searchResults = results.data.children;
                            var finalResultCollection = [];

                            // Filter out Reddit threads that do not lead to the video.
                            searchResults.forEach(function(result) {
                                if (CommentSection.validateItemFromResultSet(result.data, currentVideoIdentifier)) {
                                    finalResultCollection.push(result.data);
                                }
                            });

                            if (finalResultCollection.length > 0) {
                                var preferredSubreddit = null;
                                var preferredPost = null;

                                /* Scan the YouTube comment sections for references to subreddits or reddit threads.
                                These will be prioritised and loaded first.  */
                                var commentLinks = document.querySelectorAll("#eow-description a");
                                for (var b = 0, coLen = commentLinks.length; b < coLen; b++) {
                                    var linkElement = <HTMLElement>commentLinks[b];
                                    var url = linkElement.getAttribute("href");
                                    if (typeof(url) !== 'undefined') {
                                        var mRegex = /(?:http|https):\/\/(.[^/]+)\/r\/([A-Za-z0-9][A-Za-z0-9_]{2,20})(?:\/comments\/)?([A-Za-z0-9]*)/g;
                                        var match = mRegex.exec(url);
                                        if (match) {
                                            preferredSubreddit = match[2];
                                            if (match[3].length > 0) preferredPost = match[3];
                                        }
                                    }
                                }

                                // Sort threads into array groups by what subreddit they are in.
                                var sortedResultCollection = {};
                                finalResultCollection.forEach(function(thread) {
                                    if (!sortedResultCollection.hasOwnProperty(thread.subreddit)) sortedResultCollection[thread.subreddit] = [];
                                    sortedResultCollection[thread.subreddit].push(thread);
                                });

                                // Retrieve the subreddit that has the best score/comment relation in each subreddit, or is in the comment section.
                                this.threadCollection = [];
                                for (var subreddit in sortedResultCollection) {
                                    if (sortedResultCollection.hasOwnProperty(subreddit)) {
                                        this.threadCollection.push(sortedResultCollection[subreddit].reduce(function (a, b) {
                                            return ((a.score + (a.num_comments*3)) > (b.score + (b.num_comments*3)) || b.id === preferredPost) ? a : b;
                                        }));
                                    }
                                }

                                // Sort subreddits so the one with the highest score/comment relation (or is in the comment section) is first in the list.
                                this.threadCollection.sort(function (a, b) {
                                    if (b.subreddit == preferredSubreddit && b.id == preferredPost) {
                                        return 1;
                                    } else if (b.subreddit == preferredSubreddit) {
                                        return 1;
                                    } else {
                                        return ((b.score + (b.num_comments*3)) - (a.score + (a.num_comments*3)));
                                    }
                                });

                                // Generate tabs.
                                var tabContainer = this.template.getElementById("tabcontainer").content.cloneNode(true);
                                var actualTabContainer = tabContainer.querySelector("#at_tabcontainer");
                                var overflowContainer = tabContainer.querySelector("#at_overflow");
                                var len = this.threadCollection.length;
                                var maxWidth = document.getElementById("watch7-content").offsetWidth - 80;
                                var width = (21 + this.threadCollection[0].subreddit.length * 7);

                                /* Calculate the width of tabs and determine how many you can fit without breaking the
                                bounds of the comment section. */
                                if (len > 1) {
                                    var i;
                                    for (i = 1; i < len; i++) {
                                        width = width + (21 + (this.threadCollection[i].subreddit.length * 7));
                                        if (width >= maxWidth) {
                                            break;
                                        }
                                        var tab = document.createElement("button");
                                        tab.className = "at_tab";
                                        tab.setAttribute("data-value", this.threadCollection[i].subreddit);
                                        var tabName = document.createTextNode(this.threadCollection[i].subreddit);
                                        tab.appendChild(tabName);
                                        actualTabContainer.insertBefore(tab, overflowContainer);
                                    }
                                    // We can't fit any more tabs. We will now start populating the overflow menu.
                                    if (i < len) {
                                        for (i = i; i < len; i++) {
                                            var menuItem = document.createElement("li");
                                            menuItem.setAttribute("data-value", this.threadCollection[i].subreddit);
                                            var itemName = document.createTextNode(this.threadCollection[i].subreddit);
                                            menuItem.appendChild(itemName);
                                            overflowContainer.children[1].appendChild(menuItem);
                                        }
                                    } else {
                                        overflowContainer.style.display = "none";
                                    }
                                }

                                // Load the image for the Google+ icon.
                                tabContainer.querySelector(".at_gplus img").src = Main.getExtensionRessourcePath("gplus.png");

                                // Set loading indicator
                                var loadingContentIndicator = tabContainer.querySelector(".loading");
                                loadingContentIndicator.appendChild(document.createTextNode(Main.localisationManager.get("loadingContentText")));
                                this.set(loadingContentIndicator);
                                this.set(tabContainer);

                                // Load the first tab.
                                this.downloadThread(this.threadCollection[0], () => {
                                    var responseObject = JSON.parse(response);
                                    // Remove previous tab from memory if preference is unchecked; will require a download on tab switch.
                                    if (!Main.Preferences.get("rememberTabsOnViewChange")) {
                                        this.storedTabCollection.length = 0;
                                    }
                                    this.storedTabCollection.push(new CommentThread(responseObject, this));
                                });
                            } else {
                                this.returnNoResults();
                            }
                        }
                    });
                }
                templateLink.setAttribute("rel", "import");
                templateLink.setAttribute("href", Main.getExtensionRessourcePath("templates.html"));
                document.head.appendChild(templateLink);
            }
        }

        /**
        * Download a thread from Reddit.
        * @param threadData Data about the thread to download from a Reddit search page.
        * @param [callback] Callback handler for the download.
        */
        downloadThread (threadData : any, callback? : any) {
            var requestUrl = "https://pay.reddit.com/r/" + threadData.subreddit + "/comments/" + threadData.id + ".json";
            new HttpRequest(requestUrl, RequestType.GET, (response) => {
                callback(response);
            });
        }

        /**
        * Sets the contents of the comment section.
        * @param contents HTML DOM node or element to use.
        */
        set (contents : Node) {
            var commentsContainer = document.getElementById("watch7-content");
            var previousRedditInstance = document.getElementById("alientube");
            if (previousRedditInstance) {
                commentsContainer.removeChild(document.getElementById("alientube"));
            }
            var googlePlusContainer = document.getElementById("watch-discussion");
            googlePlusContainer.style.display = "none";
            var redditContainer = document.createElement("section");
            redditContainer.id = "alientube";
            redditContainer.appendChild(contents);
            commentsContainer.insertBefore(redditContainer, googlePlusContainer);
        }

        /**
            Validate a Reddit search result set and ensure the link urls go to the correct address.
            This is done due to the Reddit search result being extremely unrealiable, and providing mismatches.

            @param itemFromResultSet An object from the reddit search result array.
            @param currentVideoIdentifier A YouTube video identifier to compare to.
            @returns A boolean indicating whether the item is actually for the current video.
        */
        static validateItemFromResultSet(itemFromResultSet : any, currentVideoIdentifier : string) : Boolean {
            if (itemFromResultSet.domain === "youtube.com") {
                // For urls based on the full youtube.com domain, retrieve the value of the "v" query parameter and compare it.
                var urlSearch = itemFromResultSet.url.substring(itemFromResultSet.url.indexOf("?") +1);
                var requestItems = urlSearch.split('&');
                for (var i = 0, len = requestItems.length; i < len; i++) {
                    var requestPair = requestItems[i].split("=");
                    if (requestPair[0] === "v" && requestPair[1] === currentVideoIdentifier) {
                        return true;
                    }
                }
            } else if (itemFromResultSet.domain === "youtu.be") {
                // For urls based on the shortened youtu.be domain, retrieve everything the path after the domain and compare it.
                var urlSearch = itemFromResultSet.url.substring(itemFromResultSet.url.indexOf("/") + 1);
                var obj = urlSearch.split('?');
                if (obj[0] === currentVideoIdentifier) {
                    return true;
                }
            }
            return false;
        }

        /**
        * Set the comment section to the "No Results" page.
        */
        returnNoResults () {
            this.set(this.template.getElementById("noposts").content.cloneNode(true));
            if (Main.Preferences.get("showGooglePlus")) {
                document.getElementById("watch-discussion").style.display = "block";
            }
        }
    }
}

RB = {};

RB.DiffComment = function(filediff, interfilediff, beginLineNum, endLineNum,
                          textOnServer) {
    this.filediff = filediff;
    this.interfilediff = interfilediff;
    this.beginLineNum = beginLineNum;
    this.endLineNum = endLineNum;
    this.text = textOnServer || "";
    this.saved = (textOnServer != undefined);

    return this;
}

$.extend(RB.DiffComment.prototype, {
    /*
     * Sets the current text in the comment block.
     *
     * @param {string} text  The new text to set.
     */
    setText: function(text) {
        this.text = text;
        $.event.trigger("textChanged", null, this);
    },

    /*
     * Returns the number of lines that this comment covers.
     *
     * @return {int} The number of lines this comment covers.
     */
    getNumLines: function() {
        return this.endLineNum - this.beginLineNum + 1;
    },

    /*
     * Saves the comment on the server.
     */
    save: function() {
        var self = this;

        rbApiCall({
            url: this._getURL(),
            data: {
                action: "set",
                num_lines: this.getNumLines(),
                text: this.text
            },
            success: function() {
                self.saved = true;
                $.event.trigger("saved", null, self);
            }
        });
    },

    /*
     * Deletes the comment from the server.
     */
    deleteComment: function() {
        var self = this;

        if (this.saved) {
            rbApiCall({
                url: this._getURL(),
                data: {
                    action: "delete",
                    num_lines: this.getNumLines()
                },
                success: function() {
                    self.saved = false;
                    $.event.trigger("deleted", null, self);
                    self._deleteAndDestruct();
                }
            });
        }
        else {
            this._deleteAndDestruct();
        }
    },

    deleteIfEmpty: function() {
        if (this.text != "") {
            return;
        }

        this.deleteComment();
    },

    _deleteAndDestruct: function() {
        $.event.trigger("destroyed", null, this);
        delete self;
    },

    /*
     * Returns the URL used for API calls.
     *
     * @return {string} The URL used for API calls for this comment block.
     */
    _getURL: function() {
        var interfilediff_revision = null;
        var interfilediff_id = null;

        if (this.interfilediff != null) {
            interfilediff_revision = this.interfilediff['revision'];
            interfilediff_id = this.interfilediff['id'];
        }

        return getReviewRequestAPIPath(true) +
               getDiffAPIPath(this.filediff['revision'], this.filediff['id'],
                              interfilediff_revision, interfilediff_id,
                              this.beginLineNum);
    }
});


RB.DiffViewer = function(review_request_id, revision, interdiff_revision) {
    this.review_request_id = review_request_id;
    this.revision = revision;
    this.interdiff_revision = interdiff_revision;

    return this;
}

$.extend(RB.DiffViewer.prototype, {
    getDiffFragment: function(fileid, filediff_id, chunk_index, onSuccess) {
        rbApiCall({
            url: SITE_ROOT + 'r/' + this.review_request_id + '/diff/' +
                 this._getRevisionString() + '/fragment/' + filediff_id +
                 '/chunk/' + chunk_index + '/',
            data: {},
            type: "GET",
            dataType: "html",
            complete: function(res, status) {
                if (status == "success") {
                    onSuccess(res.responseText);
                }
            }
        });
    },

    getDiffFile: function(filediff_id, file_index, onSuccess) {
        $.ajax({
            type: "GET",
            url: SITE_ROOT + "r/" + this.review_request_id + "/diff/" +
                 this._getRevisionString() + "/fragment/" + filediff_id +
                 "/?index=" + file_index + "&" + AJAX_SERIAL,
            complete: onSuccess
        });
    },

    _getRevisionString: function() {
        var revision = this.revision;

        if (this.interdiff_revision != null) {
            revision += "-" + this.interdiff_revision;
        }

        return revision;
    }
});


RB.ReviewRequest = function(id, path, buttons) {
    this.id = id;
    this.path = path;
    this.buttons = buttons;

    return this;
}

$.extend(RB.ReviewRequest.prototype, {
    /* Constants */
    CHECK_UPDATES_MSECS: 5 * 60 * 1000, // Every 5 minutes
    CLOSE_DISCARDED: 1,
    CLOSE_SUBMITTED: 2,

    /* Review request API */
    setDraftField: function(field, value, onSuccess, onError) {
        this._apiCall({
            path: "/draft/set/" + field + "/",
            buttons: this.buttons,
            data: { value: value },
            errorPrefix: "Saving the draft has failed due to a " +
                         "server error:",
            success: onSuccess, // XXX
            error: onError // XXX
        });
    },

    publish: function() {
        this._apiCall({
            path: "/publish/",
            buttons: this.buttons,
            errorPrefix: "Publishing the draft has failed due to a " +
                         "server error:"
        });
    },

    discardDraft: function() {
        this._apiCall({
            path: "/draft/discard/",
            buttons: this.buttons,
            errorPrefix: "Discarding the draft has failed due to a " +
                         "server error:"
        });
    },

    close: function(type) {
        if (type == this.CLOSE_DISCARDED) {
            this._apiCall({
                path: "/close/discarded/",
                buttons: this.buttons,
                errorPrefix: "Discarding the review request has failed " +
                             "due to a server error:"
            });
        }
        else if (type == this.CLOSE_SUBMITTED) {
            this._apiCall({
                path: "/close/submitted/",
                buttons: this.buttons,
                errorPrefix: "Setting the review request as submitted " +
                             "has failed due to a server error:"
            });
        }
    },

    reopen: function() {
        this._apiCall({
            path: "/reopen/",
            buttons: this.buttons,
            errorPrefix: "Reopening the review request has failed " +
                         "due to a server error:"
        });
    },

    deletePermanently: function(buttons, onSuccess) {
        this._apiCall({
            path: "/delete/",
            buttons: this.buttons.add(buttons), // XXX
            errorPrefix: "Deleting the review request has failed " +
                         "due to a server error:",
            success: onSuccess
        });
    },

    beginCheckForUpdates: function(type, lastUpdateTimestamp) {
        var self = this;

        this.checkUpdatesType = type;
        this.lastUpdateTimestamp = lastUpdateTimestamp;

        setTimeout(function() { self._checkForUpdates(); },
                   this.CHECK_UPDATES_MSECS);
    },

    _checkForUpdates: function() {
        var self = this;

        this._apiCall({
            type: "GET",
            noActivityIndicator: true,
            path: "/last-update/",
            success: function(rsp) {
                if ((self.checkUpdatesType == undefined ||
                     self.checkUpdatesType == rsp.type) &&
                    self.lastUpdateTimestamp != rsp.timestamp) {
                    $.event.trigger("updated", [rsp], self);
                }

                self.lastUpdateTimestamp = rsp.timestamp;

                setTimeout(function() { self._checkForUpdates(); },
                           self.CHECK_UPDATES_MSECS);
            }
        });
    },

    _apiCall: function(options) {
        var self = this;

        options.path = "/reviewrequests/" + this.id + options.path;

        if (!options.success) {
            options.success = function() { window.location = self.path; };
        }

        rbApiCall(options);
    }
});


/*
RB.Review = function(id, review_request) {
    this.id = id;
    this.review_request = review_request;

    return this;
}

$.extend(RB.Review.prototype, {
});
*/


RB.ReviewReplyComment = function(review_request_id, review_id,
                                 context_id, context_type) {
    this.review_request_id = review_request_id;
    this.review_id = review_id;
    this.context_id = context_id;
    this.context_type = context_type;
    this.value = "";

    return this;
}

$.extend(RB.ReviewReplyComment.prototype, {
    save: function(buttons, onSuccess) {
        rbApiCall({
            path: "/reviewrequests/" + this.review_request_id +
                  "/reviews/" + this.review_id + "/replies/draft/",
            data: {
                value:     this.value,
                id:        this.context_id,
                type:      this.context_type,
                review_id: this.review_id
            },
            buttons: buttons,
            success: onSuccess
        });
    }
});


RB.ScreenshotComment = function(x, y, width, height, textOnServer) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.text = textOnServer || "";
    this.saved = (textOnServer != undefined);

    return this;
}

$.extend(RB.ScreenshotComment.prototype, {
    /*
     * Sets the current text in the comment block.
     *
     * @param {string} text  The new text to set.
     */
    setText: function(text) {
        this.text = text;
        $.event.trigger("textChanged", null, this);
    },

    /*
     * Saves the comment on the server.
     */
    save: function() {
        var self = this;

        rbApiCall({
            url: this._getURL(),
            data: {
                action: "set",
                text: this.text
            },
            success: function() {
                self.saved = true;
                $.event.trigger("saved", null, self);
            }
        });
    },

    /*
     * Deletes the comment from the server.
     */
    deleteComment: function() {
        var self = this;

        if (this.saved) {
            console.log("Calling delete");
            rbApiCall({
                url: this._getURL(),
                data: {
                    action: "delete"
                },
                success: function() {
                    self.saved = false;
                    $.event.trigger("deleted", null, self);
                    self._deleteAndDestruct();
                }
            });
        }
        else {
            this._deleteAndDestruct();
        }
    },

    deleteIfEmpty: function() {
        if (this.text != "") {
            return;
        }

        this.deleteComment();
    },

    _deleteAndDestruct: function() {
        $.event.trigger("destroyed", null, this);
        delete self;
    },

    /*
     * Returns the URL used for API calls.
     *
     * @return {string} The URL used for API calls for this comment block.
     */
    _getURL: function() {
        return getReviewRequestAPIPath(true) +
               getScreenshotAPIPath(gScreenshotId,
                                    Math.round(this.x),
                                    Math.round(this.y),
                                    Math.round(this.width),
                                    Math.round(this.height));
    }
});

// vim: set et:sw=4:

from django.conf import settings
from django.core.paginator import Paginator
from django.core.urlresolvers import reverse
from djblets.siteconfig.models import SiteConfiguration
from djblets.util.dates import get_latest_timestamp

from reviewboard.diffviewer.diffutils import get_diff_files, \
                                             get_enable_highlighting
from reviewboard.diffviewer.models import DiffSet
from reviewboard.offline.signals import adding_manifest_urls
from reviewboard.reviews.datagrids import DashboardDataGrid
from reviewboard.reviews.models import ReviewRequest, Review


def get_last_activity_timestamp(request, review_request):
    review_timestamp = 0

    if request.user.is_authenticated():
        try:
            last_draft_review = Review.objects.filter(
                review_request=review_request,
                user=request.user,
                public=False).latest()
            review_timestamp = last_draft_review.timestamp
        except Review.DoesNotExist:
            pass

    # Find out if we can bail early. Generate an ETag for this.
    timestamps = [review_request.last_updated]
    draft = review_request.get_draft()

    if draft:
        timestamps.append(draft.last_updated)

    return get_latest_timestamp(timestamps)


def add_diff_viewer_urls(request, urls, metadata, review_request):
    try:
        diffset = review_request.diffset_history.diffsets.latest()
    except DiffSet.DoesNotExist:
        return

    view_diff_url = reverse("view_diff", args=[review_request.id])

    urls += [
        { 'url': view_diff_url },
        { 'url': reverse("raw_diff", args=[review_request.id]) },
    ]

    files = get_diff_files(diffset, None, None,
                           metadata['syntax_highlighting'], False)

    # Break the list of files into pages
    siteconfig = SiteConfiguration.objects.get_current()
    paginator = Paginator(
        files,
        siteconfig.get("diffviewer_paginate_by"),
        siteconfig.get("diffviewer_paginate_orphans"))

    for pagenum in paginator.page_range:
        urls.append({
            'url': '%s?page=%d' % (view_diff_url, pagenum)
        })

    for file in files:
        urls.append({
            'url': '%s?index=%s&%s' %
                   (reverse("diff_fragment", args=[review_request.id,
                                                   diffset.revision,
                                                   file['filediff'].id]),
                    file['index'],
                    settings.AJAX_SERIAL),
        })


def add_screenshot_urls(request, urls, metadata, review_request):
    for screenshot in review_request.screenshots.all():
        urls += [
            { 'url': screenshot.get_absolute_url() },
            { 'url': screenshot.image.url },
            { 'url': screenshot.get_thumbnail_url() },
        ]


def add_diff_comment_urls(request, urls, metadata, review_request):
    diff_fragments = {}

    for review in review_request.get_public_reviews():
        for comment in review.comments.all():
            if comment.interfilediff:
                key = "%s-%s" % (comment.filediff.id, comment.interfilediff.id)
            else:
                key = comment.filediff.id

            if key not in diff_fragments:
                diff_fragments[key] = []

            diff_fragments[key].append(str(comment.id))

    for key, ids in diff_fragments.iteritems():
        # XXX It's kinda crappy that we even have to know about the queue
        #     name and comment_container, but it's needed to prevent
        #     mismatched URLs. We have to be strict and match the JavaScript.
        params = 'queue=diff_fragments&container_prefix=comment_container&' + \
                 str(settings.AJAX_SERIAL)

        urls.append({
            'url': "%s?%s" %
                   (reverse("comment_diff_fragments",
                            args=[review_request.id, ",".join(ids)]),
                    params),
        })


def add_review_request_urls(request, urls, metadata, review_request):
    # Grab the latest activity timestamp.
    # TODO: Make this common between here and review_detail.
    timestamp = get_last_activity_timestamp(request, review_request)

    if (not metadata['latest_timestamp'] or
        timestamp > metadata['latest_timestamp']):
        metadata['latest_timestamp'] = timestamp

    urls.append({
        'url': review_request.get_absolute_url(),
    })

    add_diff_viewer_urls(request, urls, metadata, review_request)
    add_screenshot_urls(request, urls, metadata, review_request)
    add_diff_comment_urls(request, urls, metadata, review_request)


def add_urls_from_datagrid(urls, found_review_requests, metadata,
                           datagrid, view, group=None):
    datagrid.load_state()

    datagrid_params = "view=%s" % view

    if group:
        datagrid_params += "&group=%s" % group

    datagrid_url = "%s?%s" % (reverse("dashboard"), datagrid_params)

    urls.append({
        'url': datagrid_url,
        'matchQuery': {
            'hasAll': datagrid_params,
        },
    })

    for obj_info in datagrid.rows:
        review_request = obj_info['object']
        assert isinstance(review_request, ReviewRequest)

        if review_request.id not in found_review_requests:
            found_review_requests[review_request.id] = True

            add_review_request_urls(datagrid.request, urls, metadata,
                                    review_request)


def add_urls(request, urls, metadata, **kwargs):
    found_review_requests = {}

    metadata['syntax_highlighting'] = \
        get_enable_highlighting(request.user)


    # Add the base Dashboard and "/" redirect.
    urls += [
        { 'url': reverse('dashboard') },
        { 'url': settings.SITE_ROOT, 'redirect': reverse('dashboard') },
    ]

    # Start grabbing all the review requests on the first page of each
    # datagrid.
    for view in ["incoming", "to-me", "starred"]:
        datagrid = DashboardDataGrid(request, view=view)
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        add_urls_from_datagrid(urls, found_review_requests, metadata,
                               datagrid, view)

    for review_group in request.user.review_groups.all():
        datagrid = DashboardDataGrid(request, view="to-group",
                                     group=review_group.name)
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        add_urls_from_datagrid(urls, found_review_requests, metadata,
                               datagrid, "to-group", review_group.name)


adding_manifest_urls.connect(add_urls)

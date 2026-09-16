import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    await authenticate.admin(request);
    return null;
};

export default function Resources() {
    return (
        <s-page heading="Resources">
            <s-section heading="Resources">
                <s-paragraph>This is the resources page. Nothing here yet.</s-paragraph>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};
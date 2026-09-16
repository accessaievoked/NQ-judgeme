import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    await authenticate.admin(request);
    return null;
};

export default function Analytics() {
    return (
        <s-page heading="Analytics">
            <s-section heading="Analytics">
                <s-paragraph>This is the analytics page. Nothing here yet.</s-paragraph>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};
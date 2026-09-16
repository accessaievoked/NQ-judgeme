// app/routes/app.reviews.jsx
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    await authenticate.admin(request);
    return null;
};

export default function Reviews() {
    return (
        <s-page heading="Reviews">
            <s-section heading="Reviews">
                <s-paragraph>This is the reviews page. Nothing here yet.</s-paragraph>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};